import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { Server } from 'socket.io';
import { DatabaseManager, FacebookAccount, CarListing } from './DatabaseManager';
import fs from 'fs/promises';
import path from 'path';

// Configure Puppeteer with stealth and adblocker
puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(AdblockerPlugin({ blockTrackers: true }));

interface FacebookSession {
  accountId: string;
  browser: Browser;
  page: Page;
  isLoggedIn: boolean;
  email: string;
  displayName: string;
  lastActivity: Date;
}

interface PostingResult {
  success: boolean;
  marketplaceUrl?: string;
  postId?: string;
  errorMessage?: string;
  screenshots?: string[];
}

export class FacebookBot {
  private sessions: Map<string, FacebookSession> = new Map();
  private dbManager: DatabaseManager;
  private io: Server;
  private isRunning: boolean = false;
  private readonly userDataDir: string;

  constructor(dbManager: DatabaseManager, io: Server) {
    this.dbManager = dbManager;
    this.io = io;
    this.userDataDir = path.join(process.cwd(), 'facebook_profiles');
    this.ensureUserDataDir();
  }

  private async ensureUserDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.userDataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create user data directory:', error);
    }
  }

  /**
   * Initialize all Facebook accounts
   */
  async initializeAllAccounts(): Promise<void> {
    try {
      const accounts = await this.dbManager.getActiveAccounts();
      console.log(`🚀 Initializing ${accounts.length} Facebook accounts`);

      for (const account of accounts) {
        await this.initializeAccount(account);
        // Add delay between account initializations to avoid detection
        await this.delay(5000, 10000);
      }

      console.log(`✅ Initialized ${this.sessions.size} Facebook accounts successfully`);
      
      // Emit status update
      this.io.emit('accounts-initialized', {
        total: accounts.length,
        active: this.sessions.size,
        message: `${this.sessions.size}/${accounts.length} accounts ready for posting`
      });

    } catch (error) {
      console.error('Failed to initialize accounts:', error);
      this.io.emit('initialization-error', { error: (error as Error).message });
    }
  }

  /**
   * Initialize a single Facebook account
   */
  async initializeAccount(account: FacebookAccount): Promise<boolean> {
    try {
      console.log(`🔑 Initializing account: ${account.email}`);

      // Create browser instance with unique user data directory
      const profilePath = path.join(this.userDataDir, `profile_${account.id}`);
      await fs.mkdir(profilePath, { recursive: true });

      const browser = await puppeteerExtra.launch({
        headless: false, // Set to true for production
        userDataDir: profilePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });

      const page = await browser.newPage();

      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      // Try to login
      const loginSuccess = await this.loginToFacebook(page, account);

      if (loginSuccess) {
        // Store session
        const session: FacebookSession = {
          accountId: account.id,
          browser,
          page,
          isLoggedIn: true,
          email: account.email,
          displayName: account.displayName,
          lastActivity: new Date()
        };

        this.sessions.set(account.id, session);

        // Update account status in database
        await this.dbManager.updateAccount(account.id, {
          lastLogin: new Date(),
          status: 'active'
        });

        console.log(`✅ Successfully initialized account: ${account.email}`);
        return true;

      } else {
        await browser.close();
        console.log(`❌ Failed to initialize account: ${account.email}`);
        return false;
      }

    } catch (error) {
      console.error(`Failed to initialize account ${account.email}:`, error);
      return false;
    }
  }

  /**
   * Login to Facebook
   */
  private async loginToFacebook(page: Page, account: FacebookAccount): Promise<boolean> {
    try {
      console.log(`🔐 Logging into Facebook: ${account.email}`);

      // Navigate to Facebook
      await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });

      // Check if already logged in
      const isAlreadyLoggedIn = await page.$('#userNavigationLabel') !== null;
      if (isAlreadyLoggedIn) {
        console.log(`✅ Account ${account.email} already logged in`);
        return true;
      }

      // Find login form elements
      const emailInput = await page.$('#email');
      const passwordInput = await page.$('#pass');
      const loginButton = await page.$('[data-testid="royal_login_button"]');

      if (!emailInput || !passwordInput || !loginButton) {
        throw new Error('Login form elements not found');
      }

      // Clear existing values and enter credentials
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(account.email, { delay: 100 });

      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(account.password, { delay: 100 });

      // Click login button
      await loginButton.click();

      // Wait for navigation or error
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Check for successful login
      const profileElement = await page.$('#userNavigationLabel');
      if (profileElement) {
        console.log(`✅ Successfully logged into ${account.email}`);
        return true;
      }

      // Check for 2FA or security check
      const checkpointUrl = page.url();
      if (checkpointUrl.includes('checkpoint') || checkpointUrl.includes('login_approval')) {
        console.log(`⚠️ Account ${account.email} requires 2FA or security verification`);
        
        // Update account status
        await this.dbManager.updateAccount(account.id, { status: 'limited' });
        return false;
      }

      console.log(`❌ Login failed for ${account.email}`);
      return false;

    } catch (error) {
      console.error(`Login error for ${account.email}:`, error);
      return false;
    }
  }

  /**
   * Post a car listing to Facebook Marketplace
   */
  async postCarToMarketplace(carId: string, accountId: string): Promise<PostingResult> {
    try {
      const session = this.sessions.get(accountId);
      if (!session || !session.isLoggedIn) {
        throw new Error(`No active session for account ${accountId}`);
      }

      const car = await this.dbManager.getAllCarListings();
      const carListing = car.find(c => c.id === carId);
      if (!carListing) {
        throw new Error(`Car listing ${carId} not found`);
      }

      console.log(`🚗 Posting ${carListing.year} ${carListing.make} ${carListing.model} to account ${session.email}`);

      const { page } = session;

      // Navigate to Facebook Marketplace
      await page.goto('https://www.facebook.com/marketplace/create/vehicle', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for the create listing form
      await page.waitForSelector('[data-testid="marketplace-create-listing-form"]', { timeout: 15000 });

      // Fill out the vehicle form
      await this.fillVehicleForm(page, carListing);

      // Upload images
      if (carListing.images.length > 0) {
        await this.uploadImages(page, carListing.images);
      }

      // Set price
      await this.setPrice(page, carListing.price);

      // Set location
      await this.setLocation(page, carListing.location);

      // Add description
      await this.setDescription(page, carListing.description);

      // Submit the listing
      const postResult = await this.submitListing(page);

      if (postResult.success) {
        // Update database
        await this.dbManager.updateCarListing(carId, { status: 'posted' });
        
        // Update daily quota
        const today = new Date().toISOString().split('T')[0];
        const currentQuota = await this.dbManager.getDailyQuota(accountId, today);
        const newCount = (currentQuota?.listingsPosted || 0) + 1;
        await this.dbManager.createOrUpdateDailyQuota(accountId, today, newCount);

        console.log(`✅ Successfully posted car to marketplace: ${postResult.marketplaceUrl}`);
        
        // Emit success event
        this.io.emit('listing-posted', {
          carId,
          accountId,
          accountEmail: session.email,
          car: `${carListing.year} ${carListing.make} ${carListing.model}`,
          marketplaceUrl: postResult.marketplaceUrl,
          price: carListing.price
        });
      }

      return postResult;

    } catch (error) {
      console.error(`Failed to post car ${carId} to account ${accountId}:`, error);
      
      const errorResult: PostingResult = {
        success: false,
        errorMessage: (error as Error).message
      };

      // Update failed count in daily quota
      const today = new Date().toISOString().split('T')[0];
      const currentQuota = await this.dbManager.getDailyQuota(accountId, today);
      await this.dbManager.createOrUpdateDailyQuota(
        accountId, 
        today, 
        currentQuota?.listingsPosted || 0,
        (currentQuota?.listingsFailed || 0) + 1
      );

      // Emit error event
      this.io.emit('listing-failed', {
        carId,
        accountId,
        error: (error as Error).message
      });

      return errorResult;
    }
  }

  /**
   * Fill vehicle form with car details
   */
  private async fillVehicleForm(page: Page, car: CarListing): Promise<void> {
    try {
      // Year
      const yearInput = await page.$('[data-testid="year-input"]') || await page.$('input[placeholder*="Year"]');
      if (yearInput) {
        await yearInput.click();
        await yearInput.type(car.year.toString());
      }

      // Make
      const makeInput = await page.$('[data-testid="make-input"]') || await page.$('input[placeholder*="Make"]');
      if (makeInput) {
        await makeInput.click();
        await makeInput.type(car.make);
        await this.delay(1000, 2000);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      }

      // Model
      const modelInput = await page.$('[data-testid="model-input"]') || await page.$('input[placeholder*="Model"]');
      if (modelInput) {
        await modelInput.click();
        await modelInput.type(car.model);
        await this.delay(1000, 2000);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      }

      // Mileage
      const mileageInput = await page.$('[data-testid="mileage-input"]') || await page.$('input[placeholder*="Mileage"]');
      if (mileageInput) {
        await mileageInput.click();
        await mileageInput.type(car.mileage.toString());
      }

      // Condition
      const conditionDropdown = await page.$('[data-testid="condition-dropdown"]');
      if (conditionDropdown) {
        await conditionDropdown.click();
        await this.delay(500, 1000);
        
        const conditionOption = await page.$(`[data-testid="condition-${car.condition}"]`);
        if (conditionOption) {
          await conditionOption.click();
        }
      }

      // Body Type
      const bodyTypeDropdown = await page.$('[data-testid="body-type-dropdown"]');
      if (bodyTypeDropdown) {
        await bodyTypeDropdown.click();
        await this.delay(500, 1000);
        
        const bodyTypeOption = await page.$(`[data-testid="body-type-${car.bodyType.toLowerCase()}"]`);
        if (bodyTypeOption) {
          await bodyTypeOption.click();
        }
      }

      // Transmission
      const transmissionDropdown = await page.$('[data-testid="transmission-dropdown"]');
      if (transmissionDropdown) {
        await transmissionDropdown.click();
        await this.delay(500, 1000);
        
        const transmissionOption = await page.$(`[data-testid="transmission-${car.transmission.toLowerCase()}"]`);
        if (transmissionOption) {
          await transmissionOption.click();
        }
      }

      // Fuel Type
      const fuelTypeDropdown = await page.$('[data-testid="fuel-type-dropdown"]');
      if (fuelTypeDropdown) {
        await fuelTypeDropdown.click();
        await this.delay(500, 1000);
        
        const fuelTypeOption = await page.$(`[data-testid="fuel-type-${car.fuelType.toLowerCase()}"]`);
        if (fuelTypeOption) {
          await fuelTypeOption.click();
        }
      }

      // Color
      const colorInput = await page.$('[data-testid="color-input"]') || await page.$('input[placeholder*="Color"]');
      if (colorInput) {
        await colorInput.click();
        await colorInput.type(car.color);
      }

      console.log(`✅ Filled vehicle form for ${car.year} ${car.make} ${car.model}`);

    } catch (error) {
      console.error('Error filling vehicle form:', error);
      throw error;
    }
  }

  /**
   * Upload images to the listing
   */
  private async uploadImages(page: Page, imagePaths: string[]): Promise<void> {
    try {
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (!fileInput) {
        console.log('⚠️ File upload input not found, skipping images');
        return;
      }

      // Validate and filter existing image files
      const validImagePaths: string[] = [];
      for (const imagePath of imagePaths.slice(0, 10)) { // Facebook allows max 10 images
        try {
          await fs.access(imagePath);
          validImagePaths.push(imagePath);
        } catch {
          console.log(`⚠️ Image not found: ${imagePath}`);
        }
      }

      if (validImagePaths.length > 0) {
        await fileInput.uploadFile(...validImagePaths);
        
        // Wait for images to upload
        await this.delay(3000, 5000);
        console.log(`✅ Uploaded ${validImagePaths.length} images`);
      }

    } catch (error) {
      console.error('Error uploading images:', error);
      // Don't throw - images are optional
    }
  }

  /**
   * Set the price for the listing
   */
  private async setPrice(page: Page, price: number): Promise<void> {
    try {
      const priceInput = await page.$('[data-testid="price-input"]') || await page.$('input[placeholder*="Price"]');
      if (priceInput) {
        await priceInput.click({ clickCount: 3 });
        await priceInput.type(price.toString());
        console.log(`✅ Set price: $${price}`);
      }
    } catch (error) {
      console.error('Error setting price:', error);
      throw error;
    }
  }

  /**
   * Set the location for the listing
   */
  private async setLocation(page: Page, location: string): Promise<void> {
    try {
      const locationInput = await page.$('[data-testid="location-input"]') || await page.$('input[placeholder*="Location"]');
      if (locationInput) {
        await locationInput.click({ clickCount: 3 });
        await locationInput.type(location);
        
        // Wait for location suggestions and select first one
        await this.delay(2000, 3000);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        
        console.log(`✅ Set location: ${location}`);
      }
    } catch (error) {
      console.error('Error setting location:', error);
      throw error;
    }
  }

  /**
   * Set the description for the listing
   */
  private async setDescription(page: Page, description: string): Promise<void> {
    try {
      const descriptionInput = await page.$('[data-testid="description-input"]') || 
                              await page.$('textarea[placeholder*="Description"]') ||
                              await page.$('div[data-testid="description-editor"]');
      
      if (descriptionInput) {
        await descriptionInput.click();
        await descriptionInput.type(description);
        console.log(`✅ Set description (${description.length} characters)`);
      }
    } catch (error) {
      console.error('Error setting description:', error);
      throw error;
    }
  }

  /**
   * Submit the listing
   */
  private async submitListing(page: Page): Promise<PostingResult> {
    try {
      // Find and click submit button
      const submitButton = await page.$('[data-testid="publish-listing-button"]') || 
                           await page.$('button[type="submit"]') ||
                           await page.$('button:has-text("Publish")');

      if (!submitButton) {
        throw new Error('Submit button not found');
      }

      await submitButton.click();

      // Wait for success or error
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Check if we're on the marketplace listing page
      const currentUrl = page.url();
      if (currentUrl.includes('/marketplace/item/')) {
        return {
          success: true,
          marketplaceUrl: currentUrl,
          postId: this.extractPostIdFromUrl(currentUrl)
        };
      }

      // Check for error messages
      const errorMessage = await page.$eval('.error-message', el => el.textContent).catch(() => null);
      if (errorMessage) {
        return {
          success: false,
          errorMessage: errorMessage
        };
      }

      // If we're still on the create page, submission likely failed
      if (currentUrl.includes('/marketplace/create/')) {
        return {
          success: false,
          errorMessage: 'Listing submission failed - still on create page'
        };
      }

      return {
        success: true,
        marketplaceUrl: currentUrl
      };

    } catch (error) {
      return {
        success: false,
        errorMessage: (error as Error).message
      };
    }
  }

  /**
   * Extract post ID from marketplace URL
   */
  private extractPostIdFromUrl(url: string): string | undefined {
    const match = url.match(/\/marketplace\/item\/(\d+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Post cars to all available accounts (respecting daily limits)
   */
  async postCarsToAllAccounts(): Promise<void> {
    try {
      const accounts = await this.dbManager.getActiveAccounts();
      const pendingCars = await this.dbManager.getPendingCarListings();

      if (pendingCars.length === 0) {
        console.log('📭 No pending car listings to post');
        return;
      }

      console.log(`🚀 Starting to post ${pendingCars.length} cars across ${accounts.length} accounts`);

      let carsPosted = 0;
      const today = new Date().toISOString().split('T')[0];

      for (const account of accounts) {
        // Check if account can still post today
        const canPost = await this.dbManager.canPostToday(account.id);
        if (!canPost) {
          console.log(`⏰ Account ${account.email} has reached daily limit`);
          continue;
        }

        // Get current quota
        const quota = await this.dbManager.getDailyQuota(account.id, today);
        const remainingPosts = account.maxDailyListings - (quota?.listingsPosted || 0);

        // Post cars up to the daily limit
        for (let i = 0; i < remainingPosts && carsPosted < pendingCars.length; i++) {
          const car = pendingCars[carsPosted];
          
          // Create listing post record
          const postId = await this.dbManager.createListingPost({
            carId: car.id,
            accountId: account.id,
            status: 'posting'
          });

          // Attempt to post
          const result = await this.postCarToMarketplace(car.id, account.id);

          // Update listing post record
          await this.dbManager.updateListingPost(postId, {
            status: result.success ? 'posted' : 'failed',
            marketplaceUrl: result.marketplaceUrl,
            facebookPostId: result.postId,
            errorMessage: result.errorMessage,
            postedAt: result.success ? new Date() : undefined
          });

          carsPosted++;

          // Add delay between posts to avoid detection
          await this.delay(30000, 60000); // 30-60 seconds
        }
      }

      console.log(`✅ Posted ${carsPosted} cars successfully`);

      // Emit completion event
      this.io.emit('daily-posting-complete', {
        totalCars: pendingCars.length,
        carsPosted,
        accountsUsed: accounts.length,
        message: `Posted ${carsPosted} cars across ${accounts.length} accounts`
      });

    } catch (error) {
      console.error('Error in mass posting:', error);
      this.io.emit('posting-error', { error: (error as Error).message });
    }
  }

  /**
   * Close all browser sessions
   */
  async closeAllSessions(): Promise<void> {
    console.log('🔄 Closing all Facebook sessions...');
    
    for (const [accountId, session] of this.sessions.entries()) {
      try {
        await session.browser.close();
        console.log(`✅ Closed session for account: ${session.email}`);
      } catch (error) {
        console.error(`Failed to close session for ${session.email}:`, error);
      }
    }

    this.sessions.clear();
    console.log('✅ All sessions closed');
  }

  /**
   * Get active sessions info
   */
  getActiveSessions(): Array<{ accountId: string; email: string; displayName: string; lastActivity: Date }> {
    return Array.from(this.sessions.values()).map(session => ({
      accountId: session.accountId,
      email: session.email,
      displayName: session.displayName,
      lastActivity: session.lastActivity
    }));
  }

  /**
   * Random delay helper
   */
  private async delay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Check if account session is active
   */
  isAccountActive(accountId: string): boolean {
    const session = this.sessions.get(accountId);
    return session ? session.isLoggedIn : false;
  }

  /**
   * Get session for account
   */
  getSession(accountId: string): FacebookSession | undefined {
    return this.sessions.get(accountId);
  }
}