import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface ImageModification {
  rotation?: number;
  brightness?: number;
  saturation?: number;
  contrast?: number;
  hue?: number;
  blur?: number;
  watermarkText?: string;
  borderColor?: string;
  borderWidth?: number;
  noiseLevel?: number;
}

interface ProcessedImageResult {
  originalPath: string;
  processedPath: string;
  modifications: ImageModification;
  hash: string;
}

export class ImageProcessor {
  private readonly processedImagesDir: string;
  private readonly watermarkTexts: string[];
  private readonly borderColors: string[];

  constructor() {
    this.processedImagesDir = path.join(process.cwd(), 'processed_images');
    this.ensureProcessedImagesDir();
    
    // Array of subtle watermark texts to rotate through
    this.watermarkTexts = [
      'Quality Auto Sales',
      'Premium Motors',
      'Elite Cars',
      'Auto Excellence',
      'Premier Vehicles',
      'Select Motors',
      'Luxury Auto',
      'Prime Cars',
      'Choice Auto',
      'Superior Motors',
      'Fine Automobiles',
      'Exclusive Cars',
      'Prestige Auto',
      'Classic Motors',
      'Ultimate Auto'
    ];

    // Subtle border colors that won't be too obvious
    this.borderColors = [
      '#FFFFFF', '#F5F5F5', '#EEEEEE', '#E0E0E0', '#D3D3D3',
      '#F8F8FF', '#F0F8FF', '#F5F5DC', '#FDF5E6', '#FFFAF0'
    ];
  }

  private async ensureProcessedImagesDir(): Promise<void> {
    try {
      await fs.mkdir(this.processedImagesDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create processed images directory:', error);
    }
  }

  /**
   * Process multiple images for a car listing with different variations
   */
  async processCarImages(imagePaths: string[], carId: string): Promise<string[]> {
    const processedPaths: string[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const originalPath = imagePaths[i];
        
        // Check if original image exists
        try {
          await fs.access(originalPath);
        } catch {
          console.log(`⚠️ Image not found: ${originalPath}`);
          continue;
        }

        // Generate unique modifications for each image
        const modification = this.generateImageModification(i);
        
        // Process the image
        const processedResult = await this.processImage(originalPath, carId, i, modification);
        
        if (processedResult) {
          processedPaths.push(processedResult.processedPath);
          console.log(`✅ Processed image ${i + 1}: ${path.basename(processedResult.processedPath)}`);
        }

      } catch (error) {
        console.error(`Failed to process image ${i}:`, error);
      }
    }

    console.log(`✅ Processed ${processedPaths.length}/${imagePaths.length} images for car ${carId}`);
    return processedPaths;
  }

  /**
   * Process a single image with specified modifications
   */
  private async processImage(
    imagePath: string, 
    carId: string, 
    imageIndex: number, 
    modification: ImageModification
  ): Promise<ProcessedImageResult | null> {
    try {
      const originalImage = sharp(imagePath);
      const metadata = await originalImage.metadata();
      
      if (!metadata.width || !metadata.height) {
        throw new Error('Invalid image metadata');
      }

      // Generate unique filename
      const ext = path.extname(imagePath);
      const filename = `${carId}_${imageIndex}_${uuidv4()}${ext}`;
      const outputPath = path.join(this.processedImagesDir, filename);

      // Start with the base image
      let processedImage = originalImage;

      // Apply rotation if specified
      if (modification.rotation && modification.rotation !== 0) {
        processedImage = processedImage.rotate(modification.rotation, {
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        });
      }

      // Apply color adjustments
      const colorModulations: any = {};
      if (modification.brightness !== undefined) {
        colorModulations.brightness = modification.brightness;
      }
      if (modification.saturation !== undefined) {
        colorModulations.saturation = modification.saturation;
      }
      if (modification.hue !== undefined) {
        colorModulations.hue = modification.hue;
      }

      if (Object.keys(colorModulations).length > 0) {
        processedImage = processedImage.modulate(colorModulations);
      }

      // Apply contrast if specified
      if (modification.contrast !== undefined) {
        processedImage = processedImage.linear(modification.contrast, 0);
      }

      // Apply subtle blur if specified
      if (modification.blur && modification.blur > 0) {
        processedImage = processedImage.blur(modification.blur);
      }

      // Add border if specified
      if (modification.borderWidth && modification.borderColor) {
        const borderSize = modification.borderWidth;
        processedImage = processedImage.extend({
          top: borderSize,
          bottom: borderSize,
          left: borderSize,
          right: borderSize,
          background: modification.borderColor
        });
      }

      // Add noise if specified
      if (modification.noiseLevel && modification.noiseLevel > 0) {
        processedImage = await this.addNoise(processedImage, modification.noiseLevel);
      }

      // Add watermark text if specified
      if (modification.watermarkText) {
        processedImage = await this.addWatermark(processedImage, modification.watermarkText, metadata);
      }

      // Save the processed image
      await processedImage
        .jpeg({ quality: 92 }) // High quality to avoid compression artifacts
        .toFile(outputPath);

      // Generate hash for tracking
      const hash = await this.generateImageHash(outputPath);

      return {
        originalPath: imagePath,
        processedPath: outputPath,
        modifications: modification,
        hash
      };

    } catch (error) {
      console.error(`Error processing image ${imagePath}:`, error);
      return null;
    }
  }

  /**
   * Generate random but subtle image modifications
   */
  private generateImageModification(imageIndex: number): ImageModification {
    const modifications: ImageModification[] = [
      // Rotation variations
      { rotation: 1 }, // Very subtle rotation
      { rotation: -1 },
      { rotation: 2 },
      { rotation: -2 },
      
      // Brightness variations
      { brightness: 1.05 }, // 5% brighter
      { brightness: 0.95 }, // 5% darker
      { brightness: 1.1 },
      { brightness: 0.9 },
      
      // Saturation variations
      { saturation: 1.1 }, // 10% more saturated
      { saturation: 0.9 }, // 10% less saturated
      { saturation: 1.15 },
      { saturation: 0.85 },
      
      // Contrast variations
      { contrast: 1.05 },
      { contrast: 0.95 },
      
      // Hue variations (very subtle)
      { hue: 5 },
      { hue: -5 },
      { hue: 10 },
      { hue: -10 },
      
      // Border variations
      { 
        borderWidth: 2, 
        borderColor: this.borderColors[imageIndex % this.borderColors.length] 
      },
      { 
        borderWidth: 3, 
        borderColor: this.borderColors[(imageIndex + 1) % this.borderColors.length] 
      },
      { 
        borderWidth: 5, 
        borderColor: this.borderColors[(imageIndex + 2) % this.borderColors.length] 
      },
      
      // Watermark variations
      { 
        watermarkText: this.watermarkTexts[imageIndex % this.watermarkTexts.length] 
      },
      { 
        watermarkText: this.watermarkTexts[(imageIndex + 3) % this.watermarkTexts.length] 
      },
      
      // Combination modifications
      { 
        rotation: 1, 
        brightness: 1.05, 
        watermarkText: this.watermarkTexts[imageIndex % this.watermarkTexts.length] 
      },
      { 
        saturation: 1.1, 
        borderWidth: 2, 
        borderColor: this.borderColors[imageIndex % this.borderColors.length] 
      },
      { 
        brightness: 0.95, 
        contrast: 1.05, 
        hue: 5 
      },
      { 
        rotation: -1, 
        saturation: 0.9, 
        borderWidth: 3, 
        borderColor: this.borderColors[(imageIndex + 1) % this.borderColors.length] 
      },
      
      // Subtle noise variations
      { noiseLevel: 0.5 },
      { noiseLevel: 1.0 },
      
      // Multiple combined effects
      { 
        rotation: 2, 
        brightness: 1.1, 
        saturation: 1.05, 
        watermarkText: this.watermarkTexts[(imageIndex + 2) % this.watermarkTexts.length] 
      }
    ];

    // Select modification based on image index, ensuring variety
    return modifications[imageIndex % modifications.length];
  }

  /**
   * Add watermark text to image
   */
  private async addWatermark(
    image: sharp.Sharp, 
    text: string, 
    metadata: sharp.Metadata
  ): Promise<sharp.Sharp> {
    try {
      const width = metadata.width || 800;
      const height = metadata.height || 600;
      
      // Create watermark with subtle transparency
      const fontSize = Math.max(16, Math.min(width / 25, 24));
      
      // Position watermark in bottom right corner
      const watermarkBuffer = Buffer.from(
        `<svg width="${width}" height="${height}">
          <style>
            .watermark { 
              fill: rgba(255,255,255,0.3); 
              font-size: ${fontSize}px; 
              font-family: Arial, sans-serif; 
              font-weight: bold;
            }
          </style>
          <text x="${width - 10}" y="${height - 20}" text-anchor="end" class="watermark">${text}</text>
        </svg>`
      );

      return image.composite([
        { input: watermarkBuffer, gravity: 'southeast' }
      ]);

    } catch (error) {
      console.error('Error adding watermark:', error);
      return image; // Return original if watermark fails
    }
  }

  /**
   * Add subtle noise to image to make it unique
   */
  private async addNoise(image: sharp.Sharp, noiseLevel: number): Promise<sharp.Sharp> {
    try {
      const metadata = await image.metadata();
      const width = metadata.width || 800;
      const height = metadata.height || 600;

      // Create noise pattern
      const noiseBuffer = Buffer.alloc(width * height * 3);
      for (let i = 0; i < noiseBuffer.length; i += 3) {
        const noise = (Math.random() - 0.5) * noiseLevel;
        noiseBuffer[i] = Math.max(0, Math.min(255, 128 + noise));     // R
        noiseBuffer[i + 1] = Math.max(0, Math.min(255, 128 + noise)); // G
        noiseBuffer[i + 2] = Math.max(0, Math.min(255, 128 + noise)); // B
      }

      const noiseImage = sharp(noiseBuffer, {
        raw: { width, height, channels: 3 }
      }).png();

      return image.composite([
        { input: await noiseImage.toBuffer(), blend: 'overlay', opacity: 0.1 }
      ]);

    } catch (error) {
      console.error('Error adding noise:', error);
      return image;
    }
  }

  /**
   * Generate a hash for the processed image to track uniqueness
   */
  private async generateImageHash(imagePath: string): Promise<string> {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const crypto = await import('crypto');
      return crypto.createHash('md5').update(imageBuffer).digest('hex');
    } catch (error) {
      console.error('Error generating image hash:', error);
      return uuidv4();
    }
  }

  /**
   * Clean up old processed images to save disk space
   */
  async cleanupOldImages(olderThanDays: number = 7): Promise<void> {
    try {
      const files = await fs.readdir(this.processedImagesDir);
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(this.processedImagesDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} old processed images`);

    } catch (error) {
      console.error('Error cleaning up old images:', error);
    }
  }

  /**
   * Get stats about processed images
   */
  async getProcessedImageStats(): Promise<{
    totalImages: number;
    totalSizeBytes: number;
    oldestImageDate: Date | null;
    newestImageDate: Date | null;
  }> {
    try {
      const files = await fs.readdir(this.processedImagesDir);
      let totalSize = 0;
      let oldestDate: Date | null = null;
      let newestDate: Date | null = null;

      for (const file of files) {
        const filePath = path.join(this.processedImagesDir, file);
        const stats = await fs.stat(filePath);
        
        totalSize += stats.size;
        
        if (!oldestDate || stats.mtime < oldestDate) {
          oldestDate = stats.mtime;
        }
        
        if (!newestDate || stats.mtime > newestDate) {
          newestDate = stats.mtime;
        }
      }

      return {
        totalImages: files.length,
        totalSizeBytes: totalSize,
        oldestImageDate: oldestDate,
        newestImageDate: newestDate
      };

    } catch (error) {
      console.error('Error getting processed image stats:', error);
      return {
        totalImages: 0,
        totalSizeBytes: 0,
        oldestImageDate: null,
        newestImageDate: null
      };
    }
  }

  /**
   * Batch process images for multiple cars
   */
  async batchProcessImages(
    carImages: Array<{ carId: string; imagePaths: string[] }>
  ): Promise<Array<{ carId: string; processedPaths: string[] }>> {
    const results: Array<{ carId: string; processedPaths: string[] }> = [];

    for (const { carId, imagePaths } of carImages) {
      try {
        const processedPaths = await this.processCarImages(imagePaths, carId);
        results.push({ carId, processedPaths });
        
        // Small delay between cars to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Failed to process images for car ${carId}:`, error);
        results.push({ carId, processedPaths: [] });
      }
    }

    return results;
  }
}