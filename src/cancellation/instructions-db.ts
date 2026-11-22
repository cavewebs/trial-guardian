// Pre-populated cancellation instructions for common services

import type { CancellationInstructions } from '../types.js';

/**
 * Default cancellation instructions database
 * This serves as the initial dataset - users can add more via the CLI
 */
export const DEFAULT_CANCELLATION_INSTRUCTIONS: CancellationInstructions[] = [
  // Streaming Services
  {
    serviceName: 'Netflix',
    aliases: ['netflix.com'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '1-2 minutes',
    cancellationUrl: 'https://www.netflix.com/cancelplan',
    webSteps: [
      'Go to netflix.com and sign in',
      'Click your profile icon in the top right',
      'Select "Account"',
      'Click "Cancel Membership"',
      'Confirm cancellation',
    ],
    specialNotes: 'You can continue watching until the end of your billing period.',
    alternativeServices: [
      { name: 'Tubi', description: 'Free streaming with ads', url: 'https://tubitv.com', priceDifference: 'Free' },
      { name: 'Pluto TV', description: 'Free live TV and movies', url: 'https://pluto.tv', priceDifference: 'Free' },
    ],
  },
  {
    serviceName: 'Spotify',
    aliases: ['spotify.com', 'Spotify Premium'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://www.spotify.com/account/subscription/',
    webSteps: [
      'Go to spotify.com/account',
      'Sign in to your account',
      'Click "Manage your plan" under Subscription',
      'Click "Cancel Premium"',
      'Follow the prompts to confirm',
    ],
    specialNotes: 'Your account becomes a free account after cancellation. Playlists are preserved.',
    alternativeServices: [
      { name: 'YouTube Music', description: 'Free tier available', url: 'https://music.youtube.com', priceDifference: 'Free with ads' },
    ],
  },
  {
    serviceName: 'Disney+',
    aliases: ['disneyplus.com', 'Disney Plus'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://www.disneyplus.com/account',
    webSteps: [
      'Go to disneyplus.com and sign in',
      'Click your profile icon',
      'Select "Account"',
      'Click on your subscription',
      'Select "Cancel Subscription"',
      'Confirm cancellation',
    ],
    specialNotes: 'If bundled with Hulu/ESPN+, you may need to cancel through the bundle provider.',
  },
  {
    serviceName: 'Amazon Prime',
    aliases: ['amazon.com/prime', 'Prime Video', 'Amazon Prime Video'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '3-5 minutes',
    cancellationUrl: 'https://www.amazon.com/mc',
    webSteps: [
      'Go to amazon.com/mc (Manage Prime Membership)',
      'Sign in to your Amazon account',
      'Click "End membership" at the bottom',
      'Choose your end date preference',
      'Confirm cancellation',
    ],
    specialNotes: 'Amazon may offer discounts to stay. You can get a prorated refund if you haven\'t used Prime benefits.',
  },

  // Software/SaaS
  {
    serviceName: 'Adobe Creative Cloud',
    aliases: ['adobe.com', 'Adobe CC', 'Photoshop', 'Illustrator', 'Premiere Pro'],
    updatedAt: '2026-01-01',
    method: 'web-chat',
    difficulty: 'medium',
    estimatedTime: '10-15 minutes',
    cancellationUrl: 'https://account.adobe.com/plans',
    webSteps: [
      'Go to account.adobe.com/plans',
      'Sign in to your Adobe account',
      'Find your plan and click "Manage plan"',
      'Click "Cancel plan"',
      'You will be connected to a chat agent',
      'Explain you want to cancel (they will offer discounts)',
      'Insist on cancellation to complete the process',
    ],
    chatUrl: 'https://helpx.adobe.com/contact.html',
    retentionOfferTips: 'Adobe typically offers 2-3 months free or 40-60% discount. If you\'re firm about cancelling, decline all offers and they will process it.',
    specialNotes: 'Annual plans may have early termination fees (50% of remaining contract).',
  },
  {
    serviceName: 'Microsoft 365',
    aliases: ['microsoft.com', 'Office 365', 'Microsoft Office'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '3-5 minutes',
    cancellationUrl: 'https://account.microsoft.com/services',
    webSteps: [
      'Go to account.microsoft.com/services',
      'Sign in with your Microsoft account',
      'Find Microsoft 365 and click "Manage"',
      'Click "Cancel" or "Turn off recurring billing"',
      'Follow the prompts to confirm',
    ],
    specialNotes: 'You keep access until the end of your billing period. Files in OneDrive remain but may be limited.',
  },
  {
    serviceName: 'ChatGPT Plus',
    aliases: ['openai.com', 'OpenAI', 'ChatGPT'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '1-2 minutes',
    cancellationUrl: 'https://chat.openai.com/settings/subscription',
    webSteps: [
      'Go to chat.openai.com',
      'Click your profile picture in the bottom left',
      'Select "My plan"',
      'Click "Manage my subscription"',
      'Click "Cancel plan"',
      'Confirm cancellation',
    ],
    specialNotes: 'Your account reverts to free tier. Chat history is preserved.',
  },

  // News/Media
  {
    serviceName: 'New York Times',
    aliases: ['nytimes.com', 'NYT', 'NY Times'],
    updatedAt: '2026-01-01',
    method: 'phone',
    difficulty: 'medium',
    estimatedTime: '5-10 minutes',
    phoneNumber: '1-800-591-9233',
    phoneHours: 'Monday-Friday 7am-10pm ET, Saturday-Sunday 7am-3pm ET',
    bestTimeToCall: 'Tuesday-Thursday, 10am-12pm ET (shortest wait times)',
    phoneScript: 'Say "Cancel subscription" when prompted. Have your account email ready. When connected, say "I\'d like to cancel my subscription." They will ask why and offer discounts - politely decline if not interested.',
    cancellationUrl: 'https://myaccount.nytimes.com/seg/',
    webSteps: [
      'Note: Online cancellation redirects to phone',
      'Go to myaccount.nytimes.com',
      'Sign in and go to Subscription',
      'You\'ll see a phone number to call',
    ],
    retentionOfferTips: 'NYT typically offers $1/week or 50% off. If you\'re firm, they will cancel. The call usually takes 5-10 minutes including hold time.',
    specialNotes: 'Digital access ends immediately upon cancellation. Consider timing your cancellation at the end of your billing cycle.',
  },
  {
    serviceName: 'Wall Street Journal',
    aliases: ['wsj.com', 'WSJ'],
    updatedAt: '2026-01-01',
    method: 'phone',
    difficulty: 'medium',
    estimatedTime: '5-10 minutes',
    phoneNumber: '1-800-568-7625',
    phoneHours: 'Monday-Friday 7am-10pm ET, Saturday 7am-3pm ET',
    bestTimeToCall: 'Weekday mornings, 9-11am ET',
    phoneScript: 'Press 2 for subscription services, then 2 again to cancel. Have your account email ready. Politely decline retention offers if not interested.',
    retentionOfferTips: 'WSJ may offer 50% off for 6-12 months. If declining, be firm but polite.',
  },

  // Fitness
  {
    serviceName: 'Planet Fitness',
    aliases: ['planetfitness.com'],
    updatedAt: '2026-01-01',
    method: 'in-person',
    difficulty: 'hard',
    estimatedTime: '15-30 minutes',
    webSteps: [
      'Visit your home gym location in person',
      'Ask to speak with a manager about cancellation',
      'Fill out a cancellation form',
      'Request a copy of the completed form',
    ],
    specialNotes: 'Alternatively, you can send a certified letter to your home gym. Must cancel before the 10th of the month to avoid next month\'s charge. Annual fee is non-refundable.',
    cancellationEmail: 'Must be done in person or via certified mail',
  },
  {
    serviceName: 'Peloton',
    aliases: ['onepeloton.com', 'Peloton App', 'Peloton Digital'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://members.onepeloton.com/settings/subscriptions',
    webSteps: [
      'Go to members.onepeloton.com',
      'Sign in and go to Settings',
      'Click "Memberships"',
      'Click "Cancel Membership"',
      'Follow the prompts to confirm',
    ],
    specialNotes: 'Hardware financing is separate from membership and must be paid regardless of membership status.',
  },

  // Audio
  {
    serviceName: 'Audible',
    aliases: ['audible.com', 'Amazon Audible'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '3-5 minutes',
    cancellationUrl: 'https://www.audible.com/account',
    webSteps: [
      'Go to audible.com/account',
      'Sign in with your Amazon account',
      'Click "Cancel membership"',
      'Select a reason and click "Continue"',
      'Choose between pause or cancel',
      'Confirm cancellation',
    ],
    specialNotes: 'You keep all purchased audiobooks forever. Unused credits are lost upon cancellation. Consider using credits before cancelling.',
    retentionOfferTips: 'Audible often offers 1-3 months at 50% off or free. They may also offer to pause your membership instead.',
  },

  // Gaming
  {
    serviceName: 'Xbox Game Pass',
    aliases: ['xbox.com', 'Game Pass', 'Xbox Game Pass Ultimate'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://account.microsoft.com/services',
    webSteps: [
      'Go to account.microsoft.com/services',
      'Sign in with your Microsoft account',
      'Find Xbox Game Pass and click "Manage"',
      'Click "Cancel" or turn off recurring billing',
      'Confirm your choice',
    ],
    specialNotes: 'You keep access until the end of your billing period. Game saves are preserved.',
  },
  {
    serviceName: 'PlayStation Plus',
    aliases: ['playstation.com', 'PS Plus', 'PSN Plus'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '3-5 minutes',
    cancellationUrl: 'https://www.playstation.com/acct/management',
    webSteps: [
      'Go to playstation.com and sign in',
      'Go to Account Settings > Subscription',
      'Select PlayStation Plus',
      'Click "Turn Off Auto-Renew"',
      'Confirm your choice',
    ],
    specialNotes: 'You lose access to PS Plus games when subscription ends, but can re-access them if you resubscribe.',
  },

  // VPN/Security
  {
    serviceName: 'NordVPN',
    aliases: ['nordvpn.com'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '3-5 minutes',
    cancellationUrl: 'https://my.nordaccount.com/dashboard/nordvpn/',
    webSteps: [
      'Go to my.nordaccount.com',
      'Sign in to your account',
      'Go to Billing > Subscription',
      'Click "Cancel automatic payments"',
      'Confirm cancellation',
    ],
    specialNotes: '30-day money-back guarantee available for new subscriptions. Access continues until expiration.',
  },
  {
    serviceName: '1Password',
    aliases: ['1password.com'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://my.1password.com/settings/billing',
    webSteps: [
      'Go to my.1password.com',
      'Sign in and go to Settings > Billing',
      'Click "Cancel subscription"',
      'Follow the prompts to confirm',
    ],
    specialNotes: 'Your vault remains accessible in read-only mode after cancellation. Consider exporting your passwords first.',
  },

  // Cloud Storage
  {
    serviceName: 'Dropbox',
    aliases: ['dropbox.com', 'Dropbox Plus', 'Dropbox Professional'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '3-5 minutes',
    cancellationUrl: 'https://www.dropbox.com/account/plan',
    webSteps: [
      'Go to dropbox.com/account/plan',
      'Sign in to your account',
      'Click "Cancel plan" or "Downgrade"',
      'Select a reason and confirm',
    ],
    specialNotes: 'Your account downgrades to free (2GB). Files over the limit become read-only. Download important files first.',
  },
  {
    serviceName: 'iCloud+',
    aliases: ['apple.com/icloud', 'iCloud Storage'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    webSteps: [
      'On iPhone/iPad: Settings > [Your Name] > iCloud > Manage Storage > Change Storage Plan > Downgrade',
      'On Mac: System Settings > Apple ID > iCloud > Manage > Change Storage Plan',
      'On Web: appleid.apple.com > Subscriptions',
    ],
    specialNotes: 'Downgrading may cause issues if you have more data than the free 5GB allows. Photos and backups may be affected.',
  },

  // Developer Tools
  {
    serviceName: 'GitHub',
    aliases: ['github.com', 'GitHub Pro', 'GitHub Teams', 'GitHub Copilot'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://github.com/settings/billing',
    webSteps: [
      'Go to github.com/settings/billing',
      'Sign in to your account',
      'Under your plan, click "Cancel" or "Edit"',
      'Follow the prompts to downgrade or cancel',
    ],
    specialNotes: 'Private repos remain private but some features may be limited. Copilot access ends immediately.',
  },
  {
    serviceName: 'Vercel',
    aliases: ['vercel.com'],
    updatedAt: '2026-01-01',
    method: 'web',
    difficulty: 'easy',
    estimatedTime: '2-3 minutes',
    cancellationUrl: 'https://vercel.com/account/billing',
    webSteps: [
      'Go to vercel.com/account/billing',
      'Sign in to your account',
      'Click "Cancel Plan"',
      'Follow the prompts to confirm',
    ],
    specialNotes: 'Deployments continue to work. You lose access to Pro features and may be subject to Hobby limits.',
  },
];

/**
 * Initialize the cancellation database with default instructions
 */
export async function initializeCancellationDb(): Promise<void> {
  const { addCancellationInstructions, getAllCancellationInstructions } = await import('../db/database.js');

  const existing = await getAllCancellationInstructions();

  if (existing.length === 0) {
    console.log('[CancellationDB] Initializing with default instructions...');

    for (const instruction of DEFAULT_CANCELLATION_INSTRUCTIONS) {
      await addCancellationInstructions(instruction);
    }

    console.log(`[CancellationDB] Added ${DEFAULT_CANCELLATION_INSTRUCTIONS.length} default entries`);
  }
}

/**
 * Search for cancellation instructions by service name or alias
 */
export function findInstructionsByName(
  name: string,
  instructions: CancellationInstructions[] = DEFAULT_CANCELLATION_INSTRUCTIONS
): CancellationInstructions | undefined {
  const normalizedName = name.toLowerCase();

  return instructions.find(
    (i) =>
      i.serviceName.toLowerCase() === normalizedName ||
      i.serviceName.toLowerCase().includes(normalizedName) ||
      i.aliases.some(
        (a) => a.toLowerCase() === normalizedName || a.toLowerCase().includes(normalizedName)
      )
  );
}
