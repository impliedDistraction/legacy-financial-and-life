export const site = {
  name: 'Legacy Financial & Life',
  url: 'https://legacyf-l.com',
  phone: '(XXX) XXX-XXXX', // TODO: update
  email: 'info@legacyf-l.com', // TODO: update
  cityState: 'Luthersville, GA', // TODO: confirm spellings/details
  tagline: 'Trusted. Personal. Protective. Strategic.',
  // Brand assets - updated with real company assets
  branding: {
    logo: '/images/logo.svg', // Legacy Financial & Life official logo
    ogImage: '/images/team-photo.jpg', // Tim and Beth professional photo
    favicon: '/favicon.svg' // Keep existing favicon for now
  },
  hero: {
    heading: 'Secure Your Family\'s Future with Confidence',
    sub: 'Customized life insurance solutions designed to protect loved ones, grow wealth, and bring peace of mind—today and tomorrow.',
    cta: 'Book a Free Consultation',
    enhanced: {
      backgroundImage: '/images/team-photo.jpg',
      features: [
        'Over $75M in assets managed',
        '300+ policies sold in 2 years', 
        '15+ years combined experience'
      ],
      trustIndicators: [
        'Licensed in Georgia',
        'Community trusted since 2009',
        'Specialized in retirement planning'
      ]
    }
  },
  features: [
    {
      title: 'Term Life Insurance',
      body: 'Affordable protection for a set period to safeguard your family\'s income and goals.',
      icon: '🛡️',
      isPopular: false,
      keyFeatures: [
        'Lower initial premiums',
        'Temporary coverage periods',
        'Income replacement focus'
      ],
      idealFor: 'Young families and those with temporary financial obligations',
      learnMoreContent: 'Term life insurance provides maximum coverage at minimal cost for a specific period. Perfect for protecting your family during your highest earning years when financial obligations are greatest.'
    },
    {
      title: 'Whole Life Insurance',
      body: 'Lifelong coverage with guaranteed cash value that grows over time.',
      icon: '💰',
      isPopular: true,
      keyFeatures: [
        'Guaranteed cash value growth',
        'Level premiums for life',
        'Dividend potential'
      ],
      idealFor: 'Long-term wealth building and estate planning',
      learnMoreContent: 'Whole life insurance combines permanent protection with a savings component that builds cash value you can access during your lifetime. Premiums remain level and the policy builds guaranteed value.'
    },
    {
      title: 'Universal Life Insurance',
      body: 'Flexible premiums and death benefits with long-term cash accumulation options.',
      icon: '⚖️',
      isPopular: false,
      keyFeatures: [
        'Flexible premium payments',
        'Adjustable death benefits',
        'Investment component options'
      ],
      idealFor: 'Those who want flexibility and investment growth potential',
      learnMoreContent: 'Universal life insurance offers the flexibility to adjust premiums and death benefits as your needs change, while providing cash accumulation opportunities linked to market performance.'
    },
    {
      title: 'Final Expense',
      body: 'Covers funeral and end-of-life costs to reduce burden on loved ones.',
      icon: '🤝',
      isPopular: false,
      keyFeatures: [
        'Simplified underwriting',
        'Smaller benefit amounts',
        'Immediate family relief'
      ],
      idealFor: 'Seniors and those planning end-of-life expenses',
      learnMoreContent: 'Final expense insurance is designed specifically to cover funeral costs, medical bills, and other end-of-life expenses. Features simplified applications and guaranteed acceptance options.'
    }
  ],
  retirement: {
    title: 'Tax-Advantaged Retirement Strategies',
    points: [
      'Protect growth from market downturns',
      'Access funds with potential tax advantages',
      'Blend living benefits with long-term legacy planning'
    ]
  },
  team: {
    heading: 'Meet Tim & Beth Byrd',
    intro: 'Tim and Beth Byrd are dedicated professionals specializing in financial planning, retirement solutions, and asset management. They bring over 15 years of combined experience across private, nonprofit, and government sectors.',
    description: 'Together, they\'ve managed more than $75M in HUD assets, sold 300+ life insurance policies in two years, and served in CFO and bookkeeping roles. Between the two of them, they hold advanced degrees in human services and behavioral science and are accomplished grant writers. Lifelong community volunteers, they\'ve led youth programs, served their church for over 20 years, and remain committed to helping others build secure financial futures.',
    bullets: [
      'Managed over $75M in HUD assets across public and private sectors',
      'Sold 300+ life insurance policies in just two years of specialized practice',
      'Advanced degrees in human services and behavioral science',
      'Accomplished grant writers with proven track record of securing funding',
      'Over 20 years of dedicated church and community service',
      'Led youth programs and volunteer initiatives throughout their careers'
    ],
    experience: {
      title: 'Professional Experience & Expertise',
      highlights: [
        '15+ years combined experience across private, nonprofit, and government sectors',
        'CFO and bookkeeping roles with proven financial management success',
        'Specialized expertise in retirement solutions and asset management',
        'Deep community roots with focus on education and relationship-driven service'
      ]
    },
    headshotAlt: 'Tim and Beth Byrd - Legacy Financial & Life professional team photo',
    // Updated to use real team photo
    headshotSrc: '/images/team-photo.jpg'
  },
  cta: {
    heading: 'Ready to talk through your options?',
    sub: 'No pressure, no jargon—just a conversation about what fits your family best.',
    button: 'Schedule a Strategy Call'
  },
  footerNote:
    'Licensed in GA. This website is for educational purposes. Policies and features vary by carrier and state.',
  
  // Estate Planning Page Content
  estatePlanning: {
    title: 'Estate Planning & Annuity Solutions',
    subtitle: 'Secure your legacy with strategic planning and tax-advantaged growth',
    hero: {
      heading: 'Protect Your Legacy with Strategic Estate Planning',
      sub: 'Comprehensive annuity solutions and estate planning strategies designed to preserve wealth, minimize taxes, and ensure your assets transfer according to your wishes.'
    },
    services: [
      {
        title: 'Fixed Annuities',
        description: 'Guaranteed growth with principal protection for conservative investors',
        features: ['Principal protection', 'Guaranteed interest rates', 'Tax-deferred growth']
      },
      {
        title: 'Variable Annuities', 
        description: 'Investment options with potential for higher returns based on market performance',
        features: ['Investment flexibility', 'Growth potential', 'Living benefit riders']
      },
      {
        title: 'Indexed Annuities',
        description: 'Market upside potential with downside protection linked to market indices',
        features: ['Market-linked growth', 'Principal protection', 'No direct market risk']
      },
      {
        title: 'Estate Planning Strategies',
        description: 'Comprehensive planning to minimize taxes and maximize wealth transfer',
        features: ['Tax minimization', 'Wealth preservation', 'Legacy protection']
      }
    ]
  },

  // Hiring/Recruiting Page Content  
  hiring: {
    title: 'Join Our Growing Team',
    subtitle: 'Build your insurance career with experienced mentors and cutting-edge tools',
    hero: {
      heading: 'Launch Your Insurance Career with Legacy Financial & Life',
      sub: 'Join Tim and Beth Byrd as your upline and gain access to proven systems, mentorship, and the latest AI-powered tools to accelerate your success in the insurance industry.'
    },
    benefits: [
      {
        title: 'Experienced Mentorship',
        description: 'Learn from Tim and Beth\'s 15+ years of combined experience',
        icon: '👨‍🏫'
      },
      {
        title: 'Proven Systems',
        description: 'Access to established processes that have generated 300+ policy sales',
        icon: '⚙️'
      },
      {
        title: 'AI-Powered Tools (Coming Soon)',
        description: 'Advanced CRM, automated front office, and AI-driven lead generation',
        icon: '🤖'
      },
      {
        title: 'Plan Matching AI',
        description: 'Sophisticated software to match clients with optimal insurance solutions',
        icon: '🎯'
      },
      {
        title: 'Automated Communication',
        description: 'AI-powered email, text, and call automation to streamline client interaction',
        icon: '📞'
      },
      {
        title: 'Chat Bot Integration',
        description: 'Lead qualification and initial consultation automation',
        icon: '💬'
      }
    ],
    uplineSupport: {
      title: 'Comprehensive Upline Support',
      description: 'Tim and Beth provide hands-on guidance and support to help you succeed',
      features: [
        'Weekly training sessions and strategy calls',
        'Lead generation assistance and referral sharing',
        'Contract negotiation and carrier relationship support',
        'Business development planning and goal setting',
        'Access to established client acquisition methods',
        'Technology integration and system training'
      ]
    }
  }
};