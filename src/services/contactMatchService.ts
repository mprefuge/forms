/**
 * Contact Match Service
 *
 * Provides contact matching logic with confidence scoring for Salesforce Contact records.
 * Matches based on: first name (fuzzy), last name, email, phone, secondary email, and address fields.
 */

export interface ContactMatchCriteria {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  secondaryEmail?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface ContactMatchResult {
  contactId: string;
  contactName: string;
  confidenceScore: number; // 0-100
  matchedFields: string[];
  contact?: any; // Full contact record for potential updates
  fieldsToUpdate?: { [key: string]: string }; // Fields with empty values in contact that we can fill
}

export class ContactMatchService {

  /**
   * Calculate Levenshtein distance between two strings for fuzzy matching
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate similarity score (0-1) based on Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = String(str1).trim();
    const s2 = String(str2).trim();

    if (!s1 || !s2) return 0;

    const maxLen = Math.max(s1.length, s2.length);
    const distance = this.levenshteinDistance(s1, s2);
    return Math.max(0, 1 - distance / maxLen);
  }

  /**
   * Check if first names fuzzy match (catches Will/Bill for William, etc.)
   */
  private firstNamesFuzzyMatch(name1: string | undefined, name2: string | undefined): boolean {
    if (!name1 || !name2) return false;

    // Exact match
    if (this.valuesMatch(name1, name2)) return true;

    // Common first name aliases
    const aliases: { [key: string]: string[] } = {
      'william': ['will', 'bill', 'liam', 'billy'],
      'elizabeth': ['liz', 'beth', 'betty', 'bette'],
      'richard': ['rick', 'rich', 'dick', 'ricky'],
      'robert': ['rob', 'bob', 'bert', 'bobby'],
      'james': ['jim', 'jimmy', 'jamie'],
      'christopher': ['chris', 'kit'],
      'jonathan': ['jon', 'johnny'],
      'john': ['jon', 'johnny'],
      'margaret': ['maggie', 'marge', 'peggy'],
      'benjamin': ['ben', 'benji', 'bennie'],
      'samuel': ['sam', 'sammy'],
      'alexander': ['alex', 'lex'],
      'andrew': ['andy', 'drew'],
      'daniel': ['dan', 'danny'],
      'david': ['dave', 'davy'],
      'michael': ['mike', 'mick'],
      'thomas': ['tom', 'tommy'],
      'charles': ['charlie', 'chuck'],
      'edward': ['ed', 'eddie', 'ted'],
      'joseph': ['joe', 'joey'],
      'nicholas': ['nick', 'nicky'],
      'jennifer': ['jen', 'jenny'],
      'patricia': ['pat', 'patty', 'trish'],
      'katherine': ['kate', 'katie', 'kat'],
      'dorothy': ['dottie', 'dot'],
      'susan': ['sue', 'suzy'],
      'jessica': ['jess'],
      'sarah': ['sara'],
      'karen': ['kari'],
      'nancy': ['nan'],
    };

    const norm1 = this.normalizeForComparison(name1);
    const norm2 = this.normalizeForComparison(name2);

    // Check if one is an alias of the other
    for (const [primary, aliasList] of Object.entries(aliases)) {
      const allVariants = [primary, ...aliasList];
      if (allVariants.includes(norm1) && allVariants.includes(norm2)) {
        return true;
      }
    }

    // Fuzzy match with high threshold (80%+ similarity)
    const similarity = this.calculateSimilarity(name1, name2);
    return similarity >= 0.8;
  }

  /**
   * Calculate confidence score based on matched fields
   * Higher weight for identifying fields (email, phone)
   * Lower weight for name fields
   */
  private calculateConfidenceScore(matchedFields: string[]): number {
    const weights: { [key: string]: number } = {
      'email': 25,           // Primary identifier
      'phone': 25,           // Primary identifier
      'secondaryEmail': 20,  // Secondary identifier
      'firstName': 15,       // Names have lower confidence due to duplicates
      'lastName': 15,        // Names have lower confidence due to duplicates
      'city': 10,            // Address fields have lower weight
      'state': 8,
      'zip': 12,
      'street': 8,
    };

    let totalScore = 0;

    for (const field of matchedFields) {
      const weight = weights[field] || 0;
      totalScore += weight;
    }

    // Cap at 100
    return Math.min(totalScore, 100);
  }

  /**
   * Normalize string for comparison (lowercase, trim, remove extra spaces)
   */
  private normalizeForComparison(value: string | undefined): string {
    if (!value) return '';
    return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if two values match (case-insensitive comparison)
   */
  private valuesMatch(value1: string | undefined, value2: string | undefined): boolean {
    const normalized1 = this.normalizeForComparison(value1);
    const normalized2 = this.normalizeForComparison(value2);

    if (!normalized1 || !normalized2) return false;
    return normalized1 === normalized2;
  }

  /**
   * Match form data against a Contact record
   * Returns matched field names if any matches found
   */
  private getMatchedFields(criteria: ContactMatchCriteria, contact: any): string[] {
    const matched: string[] = [];

    // Check email - criteria.email can match EITHER contact.Email OR contact.Secondary_Email__c
    if (criteria.email) {
      const emailMatches = this.valuesMatch(criteria.email, contact.Email);
      const secondaryEmailMatches = this.valuesMatch(criteria.email, contact.Secondary_Email__c);
      
      if (emailMatches || secondaryEmailMatches) {
        matched.push('email');
      }
    }

    // Check phone (handle different formats by stripping non-digits)
    if (criteria.phone && contact.Phone) {
      const phoneDigits1 = String(criteria.phone).replace(/\D/g, '');
      const phoneDigits2 = String(contact.Phone).replace(/\D/g, '');
      if (phoneDigits1 && phoneDigits1 === phoneDigits2) {
        matched.push('phone');
      }
    }

    // Check secondary email (when explicitly provided as secondaryEmail criterion)
    if (criteria.secondaryEmail && this.valuesMatch(criteria.secondaryEmail, contact.Secondary_Email__c)) {
      matched.push('secondaryEmail');
    }

    // Check first name with fuzzy matching (only if we have identifying info already)
    if (criteria.firstName && matched.length > 0) {
      if (this.firstNamesFuzzyMatch(criteria.firstName, contact.FirstName)) {
        matched.push('firstName');
      }
    }

    // Check last name (exact match only)
    if (criteria.lastName && matched.length > 0) {
      if (this.valuesMatch(criteria.lastName, contact.LastName)) {
        matched.push('lastName');
      }
    }

    // Check address fields (street, city, state, zip)
    if (criteria.street && this.valuesMatch(criteria.street, contact.MailingStreet)) {
      matched.push('street');
    }
    if (criteria.city && this.valuesMatch(criteria.city, contact.MailingCity)) {
      matched.push('city');
    }
    if (criteria.state && this.valuesMatch(criteria.state, contact.MailingState)) {
      matched.push('state');
    }
    if (criteria.zip && this.valuesMatch(criteria.zip, contact.MailingPostalCode)) {
      matched.push('zip');
    }

    return matched;
  }

  /**
   * Identify empty address fields in contact that we can fill from form data
   */
  private getFieldsToUpdate(criteria: ContactMatchCriteria, contact: any): { [key: string]: string } | undefined {
    const fieldsToUpdate: { [key: string]: string } = {};

    // Only suggest updates if we found a match on email/phone (main identifiers)
    // Otherwise we might be updating the wrong contact
    if (!contact.MailingStreet && criteria.street) {
      fieldsToUpdate.MailingStreet = String(criteria.street);
    }
    if (!contact.MailingCity && criteria.city) {
      fieldsToUpdate.MailingCity = String(criteria.city);
    }
    if (!contact.MailingState && criteria.state) {
      fieldsToUpdate.MailingState = String(criteria.state);
    }
    if (!contact.MailingPostalCode && criteria.zip) {
      fieldsToUpdate.MailingPostalCode = String(criteria.zip);
    }

    return Object.keys(fieldsToUpdate).length > 0 ? fieldsToUpdate : undefined;
  }

  /**
   * Find matching contacts and return the highest confidence match
   *
   * @param criteria Contact matching criteria
   * @param contacts Array of Contact records from Salesforce
   * @param minConfidence Minimum confidence threshold (0-100, default 70)
   * @returns ContactMatchResult if high confidence match found, null otherwise
   */
  public findBestMatch(
    criteria: ContactMatchCriteria,
    contacts: any[],
    minConfidence: number = 70
  ): ContactMatchResult | null {

    if (!contacts || contacts.length === 0) {
      return null;
    }

    // Score all contacts
    const scored: Array<{ contact: any; score: number; matched: string[] }> = [];

    for (const contact of contacts) {
      const matchedFields = this.getMatchedFields(criteria, contact);

      if (matchedFields.length > 0) {
        const score = this.calculateConfidenceScore(matchedFields);
        scored.push({ contact, score, matched: matchedFields });
      }
    }

    // Return none if no matches
    if (scored.length === 0) {
      return null;
    }

    // Sort by confidence score (highest first)
    scored.sort((a, b) => b.score - a.score);

    // Return highest scoring if it meets minimum threshold
    const bestMatch = scored[0];
    if (bestMatch.score >= minConfidence) {
      const contactName = [bestMatch.contact.FirstName, bestMatch.contact.LastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Unknown';

      const fieldsToUpdate = this.getFieldsToUpdate(criteria, bestMatch.contact);

      return {
        contactId: bestMatch.contact.Id,
        contactName,
        confidenceScore: bestMatch.score,
        matchedFields: bestMatch.matched,
        contact: bestMatch.contact,
        fieldsToUpdate,
      };
    }

    return null;
  }

  /**
   * Build SOQL WHERE clause for Contact search
   * Searches for contacts matching any of the provided criteria
   */
  public buildContactSearchQuery(criteria: ContactMatchCriteria): string {
    const conditions: string[] = [];

    if (criteria.email) {
      const email = String(criteria.email).replace(/'/g, "\\'");
      // Check if the provided email matches EITHER Email OR Secondary_Email__c
      conditions.push(`(Email = '${email}' OR Secondary_Email__c = '${email}')`);
    }

    if (criteria.phone) {
      const phone = String(criteria.phone).replace(/'/g, "\\'");
      conditions.push(`Phone = '${phone}'`);
    }

    if (criteria.secondaryEmail) {
      const secondaryEmail = String(criteria.secondaryEmail).replace(/'/g, "\\'");
      conditions.push(`Secondary_Email__c = '${secondaryEmail}'`);
    }

    if (criteria.city) {
      const city = String(criteria.city).replace(/'/g, "\\'");
      conditions.push(`MailingCity = '${city}'`);
    }

    if (criteria.state) {
      const state = String(criteria.state).replace(/'/g, "\\'");
      conditions.push(`MailingState = '${state}'`);
    }

    if (criteria.zip) {
      const zip = String(criteria.zip).replace(/'/g, "\\'");
      conditions.push(`MailingPostalCode = '${zip}'`);
    }

    // If we have identifying info (email, phone, secondary email), also search by names
    if (conditions.length > 0) {
      if (criteria.firstName && criteria.lastName) {
        const firstName = String(criteria.firstName).replace(/'/g, "\\'");
        const lastName = String(criteria.lastName).replace(/'/g, "\\'");
        conditions.push(`(FirstName = '${firstName}' AND LastName = '${lastName}')`);
      }
    }

    if (conditions.length === 0) {
      throw new Error('At least one contact matching criterion must be provided');
    }

    const whereClause = conditions.join(' OR ');
    return `SELECT Id, FirstName, LastName, Email, Phone, Secondary_Email__c, MailingStreet, MailingCity, MailingState, MailingPostalCode FROM Contact WHERE ${whereClause}`;
  }
}
