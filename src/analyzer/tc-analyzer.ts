// Terms & Conditions Analyzer
// Fetches and analyzes T&C documents for red flags

import * as cheerio from 'cheerio';
import type { TCAnalysis, TCFlag, CancellationMethod } from '../types.js';

// Red flag patterns to detect in T&C documents
const RED_FLAG_PATTERNS = {
  // Auto-renewal traps
  autoRenewal: {
    patterns: [
      /auto(?:matic(?:ally)?)?[\s-]*renew/gi,
      /will\s+(?:be\s+)?(?:automatically\s+)?renewed/gi,
      /subscription\s+(?:will\s+)?(?:automatically\s+)?continue/gi,
      /charged?\s+(?:automatically|on\s+a\s+recurring\s+basis)/gi,
    ],
    category: 'Auto-Renewal',
    severity: 'medium' as const,
  },

  // Cancellation windows
  cancellationWindow: {
    patterns: [
      /cancel\s+(?:at\s+least\s+)?(\d+)\s*(?:hours?|days?|weeks?)\s+(?:before|prior|in\s+advance)/gi,
      /must\s+(?:be\s+)?cancel(?:led|ed)?\s+(\d+)\s*(?:hours?|days?|weeks?)/gi,
      /cancellation\s+(?:must\s+(?:be\s+)?)?(?:received|submitted)\s+(\d+)\s*(?:hours?|days?|weeks?)/gi,
      /(\d+)[\s-]*(?:hour|day|week)\s+cancellation\s+(?:notice|period|window)/gi,
    ],
    category: 'Cancellation Window',
    severity: 'high' as const,
  },

  // Difficult cancellation
  difficultCancellation: {
    patterns: [
      /cancel(?:lation)?\s+(?:by\s+)?(?:phone|call(?:ing)?|telephone)/gi,
      /(?:call|phone|contact)\s+(?:us\s+)?to\s+cancel/gi,
      /cancel(?:lation)?\s+(?:by\s+)?(?:mail|letter|writing)/gi,
      /(?:send|mail)\s+(?:a\s+)?(?:written|letter)\s+(?:notice|request)/gi,
      /in[\s-]person\s+(?:cancel(?:lation)?|visit)/gi,
      /visit\s+(?:our\s+)?(?:location|store|office)\s+to\s+cancel/gi,
    ],
    category: 'Cancellation Method',
    severity: 'high' as const,
  },

  // Hidden fees
  hiddenFees: {
    patterns: [
      /(?:early\s+)?termination\s+fee/gi,
      /cancel(?:lation)?\s+fee/gi,
      /processing\s+fee/gi,
      /restocking\s+fee/gi,
      /(?:additional|extra)\s+(?:fees?|charges?)/gi,
      /service\s+(?:fee|charge)/gi,
    ],
    category: 'Hidden Fees',
    severity: 'high' as const,
  },

  // Price increases
  priceIncrease: {
    patterns: [
      /(?:price|rate|fee)s?\s+(?:may|can|will)\s+(?:be\s+)?(?:increased?|changed?|adjusted?)/gi,
      /(?:we\s+)?reserve\s+(?:the\s+)?right\s+to\s+(?:increase|change|modify)\s+(?:price|rate|fee)/gi,
      /subject\s+to\s+(?:price|rate)\s+(?:changes?|increases?)/gi,
      /introductory\s+(?:price|rate|offer)/gi,
      /promotional\s+(?:price|rate|period)/gi,
      /(?:price|rate)\s+(?:after|following)\s+(?:trial|promotional|introductory)/gi,
    ],
    category: 'Price Increase',
    severity: 'medium' as const,
  },

  // Data retention
  dataRetention: {
    patterns: [
      /(?:retain|keep|store)\s+(?:your\s+)?(?:data|information)\s+(?:for|after)/gi,
      /data\s+(?:may\s+(?:be\s+)?)?(?:retained|kept|stored)/gi,
      /(?:we\s+)?(?:may\s+)?(?:share|sell|transfer)\s+(?:your\s+)?(?:data|information)/gi,
      /third[\s-]?party\s+(?:access|sharing)/gi,
    ],
    category: 'Data Retention',
    severity: 'medium' as const,
  },

  // No refunds
  noRefunds: {
    patterns: [
      /no\s+refunds?/gi,
      /non[\s-]?refundable/gi,
      /(?:fees?|payments?|charges?)\s+(?:are\s+)?(?:non[\s-]?refundable|not\s+refundable)/gi,
      /(?:we\s+)?(?:do\s+not|cannot|will\s+not)\s+(?:provide\s+)?refunds?/gi,
      /all\s+(?:sales|purchases?|payments?)\s+(?:are\s+)?final/gi,
    ],
    category: 'Refund Policy',
    severity: 'medium' as const,
  },

  // Trial conversion
  trialConversion: {
    patterns: [
      /trial\s+(?:will\s+)?(?:automatically\s+)?convert/gi,
      /(?:after|following|at\s+the\s+end\s+of)\s+(?:the\s+)?(?:free\s+)?trial.*(?:charged|billed)/gi,
      /charged?\s+(?:at\s+the\s+end|after|following)\s+(?:of\s+)?(?:the\s+)?(?:free\s+)?trial/gi,
      /unless\s+(?:you\s+)?cancel\s+(?:before|prior)/gi,
    ],
    category: 'Trial Conversion',
    severity: 'high' as const,
  },

  // Arbitration clauses
  arbitration: {
    patterns: [
      /binding\s+arbitration/gi,
      /waive\s+(?:your\s+)?(?:right\s+to\s+)?(?:a\s+)?(?:jury\s+)?trial/gi,
      /class[\s-]?action\s+waiver/gi,
      /(?:agree|consent)\s+to\s+arbitration/gi,
    ],
    category: 'Arbitration',
    severity: 'low' as const,
  },
};

// Positive terms to look for
const POSITIVE_PATTERNS = {
  easyCancel: {
    patterns: [
      /cancel\s+(?:anytime|at\s+any\s+time)/gi,
      /(?:easy|simple)\s+(?:to\s+)?cancel/gi,
      /cancel\s+(?:online|from\s+your\s+account)/gi,
      /one[\s-]?click\s+cancel/gi,
    ],
    category: 'Easy Cancellation',
  },

  refundAvailable: {
    patterns: [
      /(?:full|pro[\s-]?rated)\s+refund/gi,
      /money[\s-]?back\s+guarantee/gi,
      /refund\s+(?:available|offered|provided)/gi,
    ],
    category: 'Refund Available',
  },

  noCommitment: {
    patterns: [
      /no\s+(?:long[\s-]?term\s+)?commitment/gi,
      /(?:month|cancel)\s+to\s+(?:month|cancel)/gi,
      /no\s+(?:contract|obligation)/gi,
    ],
    category: 'No Commitment',
  },

  keepContent: {
    patterns: [
      /keep\s+(?:your\s+)?(?:content|purchases?|downloads?)/gi,
      /(?:content|purchases?)\s+(?:remain|stay)\s+(?:yours|accessible)/gi,
      /access\s+(?:to\s+)?(?:purchased|owned)\s+content/gi,
    ],
    category: 'Keep Purchased Content',
  },
};

export interface AnalyzeOptions {
  url?: string;
  text?: string;
}

/**
 * Fetch and analyze Terms & Conditions for a service
 */
export async function analyzeTermsAndConditions(
  serviceName: string,
  options: AnalyzeOptions
): Promise<TCAnalysis> {
  let text = options.text ?? '';
  let sourceUrl = options.url ?? null;

  // Fetch T&C if URL provided
  if (options.url && !text) {
    text = await fetchTermsPage(options.url);
    sourceUrl = options.url;
  }

  // If no text, try to find T&C URL automatically
  if (!text) {
    const autoUrl = await findTermsUrl(serviceName);
    if (autoUrl) {
      text = await fetchTermsPage(autoUrl);
      sourceUrl = autoUrl;
    }
  }

  if (!text) {
    return createEmptyAnalysis(serviceName, sourceUrl);
  }

  // Analyze the text
  const redFlags = findRedFlags(text);
  const positiveTerms = findPositiveTerms(text);

  // Extract specific information
  const cancellationWindow = extractCancellationWindow(text);
  const cancellationMethod = detectCancellationMethod(text);
  const priceAfterTrial = extractPriceAfterTrial(text);

  // Calculate risk score
  const riskScore = calculateRiskScore(redFlags, positiveTerms);

  // Generate recommendation
  const recommendation = generateRecommendation(
    riskScore,
    redFlags,
    cancellationWindow,
    cancellationMethod
  );

  return {
    serviceName,
    analyzedAt: new Date().toISOString(),
    sourceUrl,
    riskScore,
    redFlags,
    positiveTerms,
    autoRenewal: hasAutoRenewal(text),
    cancellationWindow,
    cancellationMethod,
    refundPolicy: extractRefundPolicy(text),
    dataRetentionPolicy: extractDataRetentionPolicy(text),
    priceAfterTrial,
    rawExcerpts: extractRelevantExcerpts(text, redFlags),
    recommendation,
  };
}

async function fetchTermsPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove scripts and styles
    $('script, style, nav, header, footer').remove();

    // Get main content
    const content =
      $('main').text() ||
      $('article').text() ||
      $('.content').text() ||
      $('body').text();

    return content.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error(`Error fetching terms page: ${error}`);
    return '';
  }
}

async function findTermsUrl(serviceName: string): Promise<string | null> {
  // Common T&C URL patterns
  const commonPaths = [
    '/terms',
    '/terms-of-service',
    '/terms-of-use',
    '/tos',
    '/legal/terms',
    '/legal',
  ];

  // Try to construct URL from service name
  const normalizedName = serviceName.toLowerCase().replace(/\s+/g, '');
  const possibleDomains = [
    `${normalizedName}.com`,
    `www.${normalizedName}.com`,
    `${normalizedName}.io`,
  ];

  for (const domain of possibleDomains) {
    for (const path of commonPaths) {
      const url = `https://${domain}${path}`;
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
          return url;
        }
      } catch {
        // Continue trying
      }
    }
  }

  return null;
}

function findRedFlags(text: string): TCFlag[] {
  const flags: TCFlag[] = [];

  for (const [key, config] of Object.entries(RED_FLAG_PATTERNS)) {
    for (const pattern of config.patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Find the context around the match
        const match = matches[0];
        const index = text.indexOf(match);
        const excerpt = text.slice(Math.max(0, index - 50), index + match.length + 50);

        flags.push({
          category: config.category,
          description: getDescriptionForFlag(key, matches),
          severity: config.severity,
          excerpt: excerpt.trim(),
        });

        break; // Only add one flag per category
      }
    }
  }

  return flags;
}

function findPositiveTerms(text: string): TCFlag[] {
  const positives: TCFlag[] = [];

  for (const [key, config] of Object.entries(POSITIVE_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        positives.push({
          category: config.category,
          description: getPositiveDescription(key),
          severity: 'low',
        });
        break;
      }
    }
  }

  return positives;
}

function getDescriptionForFlag(key: string, matches: RegExpMatchArray): string {
  const descriptions: Record<string, string> = {
    autoRenewal: 'Subscription auto-renews unless cancelled',
    cancellationWindow: `Requires advance notice to cancel (${matches[0]})`,
    difficultCancellation: 'Cancellation requires phone call, mail, or in-person visit',
    hiddenFees: 'May include termination fees or other charges',
    priceIncrease: 'Price may increase after introductory period',
    dataRetention: 'Data may be retained or shared after cancellation',
    noRefunds: 'No refunds offered for unused service',
    trialConversion: 'Trial automatically converts to paid subscription',
    arbitration: 'Requires arbitration, waives class action rights',
  };

  return descriptions[key] ?? 'Potential concern identified';
}

function getPositiveDescription(key: string): string {
  const descriptions: Record<string, string> = {
    easyCancel: 'Easy online cancellation available',
    refundAvailable: 'Refunds may be available',
    noCommitment: 'No long-term commitment required',
    keepContent: 'Purchased content remains accessible after cancellation',
  };

  return descriptions[key] ?? 'Positive term found';
}

function extractCancellationWindow(text: string): string | null {
  for (const pattern of RED_FLAG_PATTERNS.cancellationWindow.patterns) {
    const match = text.match(pattern);
    if (match) {
      // Try to extract the number of days/hours
      const timeMatch = match[0].match(/(\d+)\s*(?:hours?|days?|weeks?)/i);
      if (timeMatch) {
        return `${timeMatch[1]} ${timeMatch[0].includes('hour') ? 'hours' : timeMatch[0].includes('week') ? 'weeks' : 'days'} before renewal`;
      }
    }
  }
  return null;
}

function detectCancellationMethod(text: string): CancellationMethod {
  if (/cancel[^.]{0,60}(in[\s-]person|visit)/i.test(text)) {
    return 'in-person';
  }
  if (/cancel[^.]{0,60}(by\s+mail|letter|in\s+writing)/i.test(text)) {
    return 'mail';
  }
  if (/cancel[^.]{0,60}(phone|call)/i.test(text)) {
    return 'phone';
  }
  if (/chat|support|customer\s+service/i.test(text)) {
    return 'web-chat';
  }
  if (/email/i.test(text)) {
    return 'email';
  }
  if (POSITIVE_PATTERNS.easyCancel.patterns.some((p) => p.test(text))) {
    return 'web';
  }

  return 'unknown';
}

function extractPriceAfterTrial(text: string): number | null {
  const patterns = [
    /(?:then|after\s+trial)\s*\$(\d+(?:\.\d{2})?)/gi,
    /\$(\d+(?:\.\d{2})?)\s*(?:per|\/)\s*month\s*(?:after|following)/gi,
    /(?:regular|standard)\s*(?:price|rate).*\$(\d+(?:\.\d{2})?)/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const priceMatch = match[0].match(/\$(\d+(?:\.\d{2})?)/);
      if (priceMatch) {
        return parseFloat(priceMatch[1]);
      }
    }
  }

  return null;
}

function hasAutoRenewal(text: string): boolean {
  return RED_FLAG_PATTERNS.autoRenewal.patterns.some((p) => p.test(text));
}

function extractRefundPolicy(text: string): string | null {
  if (RED_FLAG_PATTERNS.noRefunds.patterns.some((p) => p.test(text))) {
    return 'No refunds offered';
  }
  if (POSITIVE_PATTERNS.refundAvailable.patterns.some((p) => p.test(text))) {
    return 'Refunds may be available';
  }
  return null;
}

function extractDataRetentionPolicy(text: string): string | null {
  const matches = text.match(/(?:retain|keep|store).*data.*(?:for|after)\s+(\d+)\s*(?:days?|months?|years?)/i);
  if (matches) {
    return matches[0];
  }
  return null;
}

function calculateRiskScore(redFlags: TCFlag[], positiveTerms: TCFlag[]): number {
  let score = 5; // Base score

  // Add points for red flags
  for (const flag of redFlags) {
    if (flag.severity === 'high') score += 2;
    else if (flag.severity === 'medium') score += 1;
    else score += 0.5;
  }

  // Subtract points for positive terms
  score -= positiveTerms.length * 0.5;

  // Clamp to 1-10 range
  return Math.max(1, Math.min(10, Math.round(score)));
}

function extractRelevantExcerpts(text: string, flags: TCFlag[]): string[] {
  return flags
    .filter((f) => f.excerpt)
    .map((f) => f.excerpt!)
    .slice(0, 5);
}

function generateRecommendation(
  riskScore: number,
  redFlags: TCFlag[],
  cancellationWindow: string | null,
  cancellationMethod: CancellationMethod
): string {
  const recommendations: string[] = [];

  if (cancellationWindow) {
    recommendations.push(
      `Set a reminder to cancel at least ${cancellationWindow} to avoid being charged.`
    );
  }

  if (cancellationMethod === 'phone') {
    recommendations.push(
      'Cancellation requires a phone call - be prepared for retention offers.'
    );
  } else if (cancellationMethod === 'in-person') {
    recommendations.push(
      'Cancellation requires an in-person visit - plan accordingly.'
    );
  } else if (cancellationMethod === 'mail') {
    recommendations.push(
      'Cancellation requires written notice by mail - send certified/tracked.'
    );
  }

  const highRiskFlags = redFlags.filter((f) => f.severity === 'high');
  if (highRiskFlags.length > 0) {
    recommendations.push(
      `Be aware of ${highRiskFlags.length} high-risk terms in the agreement.`
    );
  }

  if (riskScore >= 8) {
    recommendations.push(
      'Consider carefully before subscribing - this service has concerning terms.'
    );
  } else if (riskScore >= 6) {
    recommendations.push(
      'Set calendar reminders and monitor billing statements closely.'
    );
  } else if (riskScore <= 3) {
    recommendations.push(
      'This service has relatively consumer-friendly terms.'
    );
  }

  return recommendations.join(' ');
}

function createEmptyAnalysis(serviceName: string, sourceUrl: string | null): TCAnalysis {
  return {
    serviceName,
    analyzedAt: new Date().toISOString(),
    sourceUrl,
    riskScore: 5,
    redFlags: [],
    positiveTerms: [],
    autoRenewal: false,
    cancellationWindow: null,
    cancellationMethod: 'unknown',
    refundPolicy: null,
    dataRetentionPolicy: null,
    priceAfterTrial: null,
    rawExcerpts: [],
    recommendation: 'Could not analyze terms - please review manually.',
  };
}
