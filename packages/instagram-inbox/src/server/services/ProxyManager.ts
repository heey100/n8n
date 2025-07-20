import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Proxy } from './DatabaseManager';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
}

export class ProxyManager {
  private proxies: Map<string, ProxyConfig> = new Map();
  private agents: Map<string, any> = new Map();

  constructor() {
    // Initialize with any default proxies if needed
  }

  addProxy(id: string, config: ProxyConfig): void {
    this.proxies.set(id, config);
    this.createAgent(id, config);
  }

  removeProxy(id: string): void {
    this.proxies.delete(id);
    this.agents.delete(id);
  }

  getProxy(id: string): ProxyConfig | undefined {
    return this.proxies.get(id);
  }

  getAgent(proxyId: string): any {
    return this.agents.get(proxyId);
  }

  private createAgent(id: string, config: ProxyConfig): void {
    const { host, port, username, password, type } = config;
    
    let proxyUrl = '';
    if (username && password) {
      proxyUrl = `${type}://${username}:${password}@${host}:${port}`;
    } else {
      proxyUrl = `${type}://${host}:${port}`;
    }

    let agent;
    switch (type) {
      case 'http':
        agent = new HttpProxyAgent(proxyUrl);
        break;
      case 'https':
        agent = new HttpsProxyAgent(proxyUrl);
        break;
      case 'socks4':
      case 'socks5':
        // For SOCKS proxies, you might need additional libraries like socks-proxy-agent
        // For now, we'll use HTTP proxy as fallback
        agent = new HttpProxyAgent(proxyUrl);
        break;
      default:
        agent = new HttpProxyAgent(proxyUrl);
    }

    this.agents.set(id, agent);
  }

  async testProxy(config: ProxyConfig): Promise<boolean> {
    try {
      const axios = require('axios');
      const { host, port, username, password, type } = config;
      
      let proxyUrl = '';
      if (username && password) {
        proxyUrl = `${type}://${username}:${password}@${host}:${port}`;
      } else {
        proxyUrl = `${type}://${host}:${port}`;
      }

      const agent = type === 'https' ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
      
      const response = await axios.get('https://httpbin.org/ip', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 10000
      });

      console.log(`✅ Proxy test successful. IP: ${response.data.origin}`);
      return true;
    } catch (error) {
      console.error(`❌ Proxy test failed:`, error.message);
      return false;
    }
  }

  async getProxyIP(proxyId: string): Promise<string | null> {
    try {
      const config = this.getProxy(proxyId);
      if (!config) return null;

      const axios = require('axios');
      const agent = this.getAgent(proxyId);
      
      const response = await axios.get('https://httpbin.org/ip', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 10000
      });

      return response.data.origin;
    } catch (error) {
      console.error(`Failed to get proxy IP for ${proxyId}:`, error.message);
      return null;
    }
  }

  listProxies(): Map<string, ProxyConfig> {
    return new Map(this.proxies);
  }

  getRandomProxy(): string | null {
    const proxyIds = Array.from(this.proxies.keys());
    if (proxyIds.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * proxyIds.length);
    return proxyIds[randomIndex];
  }

  validateProxyConfig(config: ProxyConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.host || config.host.trim() === '') {
      errors.push('Host is required');
    }

    if (!config.port || config.port <= 0 || config.port > 65535) {
      errors.push('Port must be between 1 and 65535');
    }

    if (!['http', 'https', 'socks4', 'socks5'].includes(config.type)) {
      errors.push('Type must be one of: http, https, socks4, socks5');
    }

    if (config.username && !config.password) {
      errors.push('Password is required when username is provided');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  updateProxyFromDB(proxy: Proxy): void {
    const config: ProxyConfig = {
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      type: proxy.type
    };

    this.addProxy(proxy.id, config);
  }

  // Load proxies from database
  loadProxiesFromDB(proxies: Proxy[]): void {
    proxies.forEach(proxy => {
      if (proxy.isActive) {
        this.updateProxyFromDB(proxy);
      }
    });
  }

  // Get proxy statistics
  getProxyStats(): { total: number; active: number } {
    return {
      total: this.proxies.size,
      active: this.proxies.size // All loaded proxies are considered active
    };
  }
}