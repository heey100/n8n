import { CarListing } from './DatabaseManager';

interface DescriptionTemplate {
  opening: string[];
  features: string[];
  condition: string[];
  selling_points: string[];
  call_to_action: string[];
}

interface DescriptionVariation {
  original: string;
  variations: string[];
  usedCount: number;
  lastUsed: Date;
}

export class DescriptionGenerator {
  private templates: DescriptionTemplate;
  private usedDescriptions: Map<string, DescriptionVariation> = new Map();
  private synonyms: Map<string, string[]>;
  private phrases: { [key: string]: string[] };

  constructor() {
    this.initializeTemplates();
    this.initializeSynonyms();
    this.initializePhrases();
  }

  private initializeTemplates(): void {
    this.templates = {
      opening: [
        "Looking for a reliable vehicle? This {year} {make} {model} is perfect for you!",
        "Don't miss out on this amazing {year} {make} {model}!",
        "Excellent opportunity to own a {year} {make} {model}!",
        "Beautiful {year} {make} {model} available now!",
        "Well-maintained {year} {make} {model} for sale!",
        "Check out this fantastic {year} {make} {model}!",
        "Great deal on this {year} {make} {model}!",
        "Quality {year} {make} {model} ready for its next owner!",
        "Stunning {year} {make} {model} in excellent condition!",
        "This {year} {make} {model} won't last long!",
        "Perfect {year} {make} {model} for your family!",
        "Reliable and affordable {year} {make} {model}!",
        "Clean {year} {make} {model} with low miles!",
        "Must see this {year} {make} {model}!",
        "Outstanding {year} {make} {model} at a great price!"
      ],
      features: [
        "Features include {features}",
        "Equipped with {features}",
        "Comes with {features}",
        "Includes {features}",
        "Has {features}",
        "Loaded with {features}",
        "Packed with {features}",
        "Offers {features}",
        "Boasts {features}",
        "Contains {features}"
      ],
      condition: [
        "Vehicle is in {condition} condition with {mileage} miles.",
        "This car has {mileage} miles and is in {condition} condition.",
        "{mileage} miles on the odometer, {condition} condition throughout.",
        "Low mileage at {mileage} miles, {condition} condition.",
        "Well-maintained with {mileage} miles, {condition} condition.",
        "Only {mileage} miles, excellent {condition} condition.",
        "{mileage} miles driven, maintained in {condition} condition.",
        "Showing {mileage} miles, kept in {condition} condition."
      ],
      selling_points: [
        "Perfect for daily commuting and weekend adventures.",
        "Ideal family vehicle with plenty of space.",
        "Great fuel economy and reliable performance.",
        "Smooth ride and comfortable interior.",
        "Well-maintained and garage kept.",
        "Single owner vehicle with complete service history.",
        "No accidents reported, clean title.",
        "Recent maintenance completed and up to date.",
        "Excellent safety ratings and features.",
        "Comfortable seating and modern amenities.",
        "Reliable transportation at an affordable price.",
        "Turn-key ready, no work needed.",
        "Everything works perfectly, drives great.",
        "Clean inside and out, very well cared for."
      ],
      call_to_action: [
        "Contact me today to schedule a viewing!",
        "Call now to arrange a test drive!",
        "Don't wait - this one won't last long!",
        "Serious inquiries only, please call!",
        "Ready to sell quickly, make an offer!",
        "Available for immediate viewing and purchase!",
        "Call or text for more information!",
        "Schedule your test drive today!",
        "Message me for additional details!",
        "Quick sale needed, priced to move!",
        "Cash or financing available!",
        "Trade-ins considered!",
        "Open to reasonable offers!",
        "Must see to appreciate!"
      ]
    };
  }

  private initializeSynonyms(): void {
    this.synonyms = new Map([
      ['excellent', ['outstanding', 'exceptional', 'superb', 'fantastic', 'amazing', 'great', 'wonderful']],
      ['good', ['nice', 'solid', 'decent', 'fine', 'quality', 'reliable', 'dependable']],
      ['beautiful', ['stunning', 'gorgeous', 'attractive', 'sharp', 'clean', 'pristine', 'immaculate']],
      ['reliable', ['dependable', 'trustworthy', 'solid', 'sturdy', 'durable', 'consistent']],
      ['perfect', ['ideal', 'excellent', 'outstanding', 'flawless', 'superb', 'wonderful']],
      ['amazing', ['incredible', 'fantastic', 'outstanding', 'remarkable', 'exceptional', 'awesome']],
      ['comfortable', ['cozy', 'spacious', 'roomy', 'pleasant', 'convenient', 'luxurious']],
      ['clean', ['pristine', 'immaculate', 'spotless', 'fresh', 'well-kept', 'mint']],
      ['maintained', ['cared for', 'serviced', 'kept up', 'looked after', 'preserved']],
      ['affordable', ['reasonable', 'budget-friendly', 'economical', 'cost-effective', 'value-priced']]
    ]);
  }

  private initializePhrases(): void {
    this.phrases = {
      transitions: [
        'Additionally,', 'Furthermore,', 'Moreover,', 'Also,', 'Plus,', 'What\'s more,', 
        'On top of that,', 'Not to mention,', 'Beyond that,', 'In addition,'
      ],
      descriptors: [
        'well-appointed', 'feature-rich', 'thoughtfully designed', 'carefully maintained',
        'meticulously cared for', 'professionally serviced', 'garage-kept', 'highway driven'
      ],
      urgency: [
        'Act fast!', 'Don\'t delay!', 'Limited time offer!', 'Won\'t last long!',
        'Priced to sell!', 'Must see!', 'Motivated seller!', 'Quick sale needed!'
      ]
    };
  }

  /**
   * Generate a unique description for a car listing
   */
  generateDescription(car: CarListing, variation: number = 0): string {
    try {
      const baseDescription = this.createBaseDescription(car);
      const uniqueDescription = this.createVariation(baseDescription, car, variation);
      
      // Track usage
      this.trackDescriptionUsage(baseDescription, uniqueDescription);
      
      return uniqueDescription;

    } catch (error) {
      console.error('Error generating description:', error);
      return this.createFallbackDescription(car);
    }
  }

  /**
   * Create base description structure
   */
  private createBaseDescription(car: CarListing): string {
    const opening = this.getRandomElement(this.templates.opening);
    const features = this.getRandomElement(this.templates.features);
    const condition = this.getRandomElement(this.templates.condition);
    const sellingPoints = this.getRandomElements(this.templates.selling_points, 2);
    const callToAction = this.getRandomElement(this.templates.call_to_action);

    let description = opening
      .replace('{year}', car.year.toString())
      .replace('{make}', car.make)
      .replace('{model}', car.model);

    description += '\n\n';

    // Add features if available
    if (car.features && car.features.length > 0) {
      const featuresText = features.replace('{features}', car.features.join(', '));
      description += featuresText + '\n\n';
    }

    // Add condition and mileage
    const conditionText = condition
      .replace('{condition}', car.condition)
      .replace('{mileage}', car.mileage.toLocaleString());
    description += conditionText + '\n\n';

    // Add selling points
    description += sellingPoints.join(' ') + '\n\n';

    // Add call to action
    description += callToAction;

    return description;
  }

  /**
   * Create a variation of the base description
   */
  private createVariation(baseDescription: string, car: CarListing, variationIndex: number): string {
    let varied = baseDescription;

    // Apply different variation techniques based on index
    switch (variationIndex % 8) {
      case 0:
        varied = this.applySynonymReplacement(varied);
        break;
      case 1:
        varied = this.addTransitionPhrases(varied);
        break;
      case 2:
        varied = this.addDescriptiveAdjectives(varied, car);
        break;
      case 3:
        varied = this.rearrangeSentences(varied);
        break;
      case 4:
        varied = this.addTechnicalDetails(varied, car);
        break;
      case 5:
        varied = this.addLocationContext(varied, car);
        break;
      case 6:
        varied = this.addUrgencyPhrases(varied);
        break;
      case 7:
        varied = this.combineTechniques(varied, car);
        break;
    }

    // Add unique identifier (subtle)
    const timestamp = Date.now().toString().slice(-4);
    varied += `\n\nListing ID: ${car.make.slice(0,2).toUpperCase()}${timestamp}`;

    return varied;
  }

  /**
   * Replace words with synonyms
   */
  private applySynonymReplacement(text: string): string {
    let result = text;
    
    for (const [word, synonyms] of this.synonyms.entries()) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(result)) {
        const synonym = this.getRandomElement(synonyms);
        result = result.replace(regex, synonym);
      }
    }

    return result;
  }

  /**
   * Add transition phrases between sentences
   */
  private addTransitionPhrases(text: string): string {
    const sentences = text.split('\n\n');
    let result = sentences[0];

    for (let i = 1; i < sentences.length; i++) {
      if (Math.random() > 0.5 && sentences[i].trim()) {
        const transition = this.getRandomElement(this.phrases.transitions);
        result += '\n\n' + transition + ' ' + sentences[i];
      } else {
        result += '\n\n' + sentences[i];
      }
    }

    return result;
  }

  /**
   * Add descriptive adjectives
   */
  private addDescriptiveAdjectives(text: string, car: CarListing): string {
    const descriptors = this.getRandomElements(this.phrases.descriptors, 2);
    const insertion = `This ${descriptors.join(', ')} ${car.color.toLowerCase()} ${car.make} ${car.model} `;
    
    return text.replace(`${car.year} ${car.make} ${car.model}`, insertion);
  }

  /**
   * Rearrange sentence order
   */
  private rearrangeSentences(text: string): string {
    const paragraphs = text.split('\n\n');
    if (paragraphs.length > 3) {
      // Swap middle paragraphs
      const temp = paragraphs[1];
      paragraphs[1] = paragraphs[2];
      paragraphs[2] = temp;
    }
    return paragraphs.join('\n\n');
  }

  /**
   * Add technical details
   */
  private addTechnicalDetails(text: string, car: CarListing): string {
    const technicalDetails = [
      `${car.transmission} transmission`,
      `${car.fuelType} engine`,
      `${car.bodyType} body style`,
      `Odometer reading: ${car.mileage.toLocaleString()} miles`
    ];

    const techSection = '\n\nTechnical Specifications:\n• ' + technicalDetails.join('\n• ');
    
    // Insert before call to action
    const parts = text.split('\n\n');
    parts.splice(-1, 0, techSection);
    
    return parts.join('\n\n');
  }

  /**
   * Add location context
   */
  private addLocationContext(text: string, car: CarListing): string {
    const locationPhrases = [
      `Located in ${car.location}`,
      `Available for viewing in ${car.location}`,
      `Pick up available in ${car.location}`,
      `Situated in ${car.location}`
    ];

    const locationText = this.getRandomElement(locationPhrases);
    return text + `\n\n${locationText}.`;
  }

  /**
   * Add urgency phrases
   */
  private addUrgencyPhrases(text: string): string {
    const urgency = this.getRandomElement(this.phrases.urgency);
    const sentences = text.split('\n\n');
    
    // Insert urgency phrase in the middle
    const middleIndex = Math.floor(sentences.length / 2);
    sentences.splice(middleIndex, 0, urgency);
    
    return sentences.join('\n\n');
  }

  /**
   * Combine multiple techniques
   */
  private combineTechniques(text: string, car: CarListing): string {
    let result = this.applySynonymReplacement(text);
    result = this.addDescriptiveAdjectives(result, car);
    result = this.addTransitionPhrases(result);
    return result;
  }

  /**
   * Generate multiple unique descriptions for batch posting
   */
  generateMultipleDescriptions(car: CarListing, count: number): string[] {
    const descriptions: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const description = this.generateDescription(car, i);
      descriptions.push(description);
    }

    return descriptions;
  }

  /**
   * Generate description based on account to ensure variety
   */
  generateDescriptionForAccount(car: CarListing, accountId: string): string {
    // Use account ID to determine variation index
    const variation = parseInt(accountId.slice(-1), 36) % 10;
    return this.generateDescription(car, variation);
  }

  /**
   * Create fallback description if generation fails
   */
  private createFallbackDescription(car: CarListing): string {
    return `${car.year} ${car.make} ${car.model} for sale! This ${car.condition} condition vehicle has ${car.mileage.toLocaleString()} miles. ${car.color} exterior, ${car.transmission} transmission, ${car.fuelType} engine. Located in ${car.location}. Asking $${car.price.toLocaleString()}. Contact for more details!`;
  }

  /**
   * Track description usage to avoid overuse
   */
  private trackDescriptionUsage(base: string, variation: string): void {
    const key = base.substring(0, 50); // Use first 50 chars as key
    
    if (this.usedDescriptions.has(key)) {
      const tracked = this.usedDescriptions.get(key)!;
      tracked.variations.push(variation);
      tracked.usedCount++;
      tracked.lastUsed = new Date();
    } else {
      this.usedDescriptions.set(key, {
        original: base,
        variations: [variation],
        usedCount: 1,
        lastUsed: new Date()
      });
    }
  }

  /**
   * Get random element from array
   */
  private getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Get multiple random elements from array
   */
  private getRandomElements<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    totalDescriptions: number;
    mostUsedPattern: string;
    averageVariations: number;
    oldestUsage: Date | null;
  } {
    const entries = Array.from(this.usedDescriptions.values());
    
    if (entries.length === 0) {
      return {
        totalDescriptions: 0,
        mostUsedPattern: '',
        averageVariations: 0,
        oldestUsage: null
      };
    }

    const mostUsed = entries.reduce((prev, current) => 
      prev.usedCount > current.usedCount ? prev : current
    );

    const totalVariations = entries.reduce((sum, entry) => sum + entry.variations.length, 0);
    const averageVariations = totalVariations / entries.length;

    const oldestUsage = entries.reduce((oldest, entry) => 
      !oldest || entry.lastUsed < oldest ? entry.lastUsed : oldest, null as Date | null
    );

    return {
      totalDescriptions: entries.length,
      mostUsedPattern: mostUsed.original.substring(0, 100) + '...',
      averageVariations,
      oldestUsage
    };
  }

  /**
   * Clear old usage data to prevent memory buildup
   */
  clearOldUsageData(olderThanDays: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    for (const [key, data] of this.usedDescriptions.entries()) {
      if (data.lastUsed < cutoffDate) {
        this.usedDescriptions.delete(key);
      }
    }

    console.log(`🧹 Cleared old description usage data older than ${olderThanDays} days`);
  }
}