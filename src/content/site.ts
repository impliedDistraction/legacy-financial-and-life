export const site = {
  name: 'Legacy Financial & Life',
  url: 'https://legacyf-l.com',
  phone: '(706) 333-5641',
  email: 'Beth@legacyf-l.com',
  cityState: 'Luthersville, GA', // TODO: confirm spellings/details
  tagline: 'Trusted. Personal. Protective. Strategic.',
  // Brand assets - updated with real company assets
  branding: {
  // Mapped to images present in /public/images
  logo: '/images/logo.png', // PNG logo (user will convert to SVG later)
  logoAlt: 'Legacy Financial & Life logo',
  ogImage: '/images/professional-image-of-both-beth-and-tim-1200w.jpg', // use generated 1200w for OG
  ogAlt: 'Tim and Beth Byrd - Legacy Financial & Life professional photo',
  favicon: '/images/favicon.ico'
  },
  hero: {
    heading: 'Secure Your Family\'s Future with Confidence',
    sub: 'Customized life insurance solutions designed to protect loved ones, grow wealth, and bring peace of mind—today and tomorrow.',
    cta: 'Book a Free Consultation',
    enhanced: {
  backgroundImage: '/images/professional-image-of-both-beth-and-tim',
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
  // Updated to use real team photo (base path — components will append sizes/webp)
  headshotSrc: '/images/professional-image-of-both-beth-and-tim'
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
        title: 'Retirement Income Planning',
        description: 'Strategic planning to ensure steady income throughout your retirement years',
        features: ['Income replacement strategies', 'Tax-efficient withdrawals', 'Longevity protection']
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

  // Event Information
  event: {
    title: 'Wills & Living Trusts',
    subtitle: 'Join Legacy Financial & Life for an Exclusive In-Person Event',
    description: 'Register to be our guest at this unique and FREE educational event',
    location: {
      name: 'Madras Community Center',
      address: '2355 Hwy-29 N',
      city: 'Newnan',
      state: 'GA',
      zip: '30265',
      fullAddress: '2355 Hwy-29 N, Newnan, GA 30265'
    },
    isActive: true, // Set to false to hide event
    sessions: [
      {
        id: 'thu-2pm',
        day: 'Thursday',
        date: 'September 11th',
        year: '2025',
        time: '2:00 PM',
        fullDateTime: 'Thursday, September 11, 2025 2:00 PM',
        value: 'Thursday, September 11, 2025 2:00 PM'
      },
      {
        id: 'thu-6pm',
        day: 'Thursday', 
        date: 'September 11th',
        year: '2025',
        time: '6:00 PM',
        fullDateTime: 'Thursday, September 11, 2025 6:00 PM',
        value: 'Thursday, September 11, 2025 6:00 PM'
      },
      {
        id: 'sat-11am',
        day: 'Saturday',
        date: 'September 13th', 
        year: '2025',
        time: '11:00 AM',
        fullDateTime: 'Saturday, September 13, 2025 11:00 AM',
        value: 'Saturday, September 13, 2025 11:00 AM'
      },
      {
        id: 'sat-2pm',
        day: 'Saturday',
        date: 'September 13th',
        year: '2025',
        time: '2:00 PM',
        fullDateTime: 'Saturday, September 13, 2025 2:00 PM',
        value: 'Saturday, September 13, 2025 2:00 PM'
      }
    ],
    topics: [
      'The advantages and disadvantages of Wills and Living Trusts',
      'How Powers of Attorney work and don\'t work (some may not be valid if you are disabled or pass away)',
      'How Probate Court works and why you may want to avoid it for your family',
      'Why putting property in your children\'s names may be a mistake',
      'Common missteps by families raising children with challenges, disabilities or special needs',
      'Protecting your home from being swallowed up by the Costs of Nursing Home Care',
      'Protecting your heirs inheritance from lawsuits, divorce and spend-thrifts',
      'Best practices for naming retirement accounts and Life Insurance beneficiaries',
      'How the new Secure Act affects your Trust and/or Retirement Accounts'
    ],
    callToAction: 'RSVP Now',
    benefits: [
      'Learn essential estate planning strategies in easy to understand terms',
      'Understand how to avoid the most common costly mistakes',
      'Discover methods to protect your home from nursing home costs',
      'Get expert insights from experienced professionals',
      'Ask questions in a comfortable, educational setting',
      'Free educational materials and consultation'
    ],
    disclaimers: [
      'For educational purposes only – nothing will be sold at this seminar.',
      'This class is not affiliated with and is offered independently of Madras Community Center.',
      'Be our guest at this unique and FREE educational event.',
      'If married, spouses are encouraged to attend. Adults only.'
    ],
    consent: {
      required: true,
      text: 'YES, I agree to be contacted by Legacy Financial & Life.',
      disclaimer: 'By submitting, you agree to be contacted via phone, email, and text by a licensed representative with Legacy Financial & Life regarding Wills & Living Trusts. Msg & data rates may apply.'
    },
    hosts: [
      {
        name: 'Tim & Beth Byrd',
        description: 'Tim and Beth Byrd are dedicated professionals specializing in financial planning, retirement solutions, and asset management. They bring over 15 years of combined experience across private, nonprofit, and government sectors. Together, they\'ve managed more than $75M in HUD assets, sold 300+ life insurance policies in two years, and served in CFO and bookkeeping roles. Between the two of them, they hold advanced degrees in human services and behavioral science and are accomplished grant writers. Lifelong community volunteers, they\'ve led youth programs, served their church for over 20 years, and remain committed to helping others build secure financial futures.',
        credentials: [
          '15+ years combined experience',
          'Managed $75M+ in HUD assets',
          'Sold 300+ life insurance policies in two years',
          'Advanced degrees in human services and behavioral science',
          'Accomplished grant writers',
          '20+ years of church and community service'
        ]
      },
      {
        name: 'Mike Morice',
        description: 'Mike Morice is a seasoned professional specializing in generational wealth strategies and estate planning. A proud graduate of Loyola University Chicago and former professional volleyball athlete, Mike has built a career dedicated to helping his clients secure their financial futures and build lasting legacies. Mike has empowered countless clients to navigate the complexities of estate planning, offering tailored guidance on trusts, wills, and investment strategies. Mike and his wife, Kate, reside in Plainfield with their two children, MJ and Lola. Mike is an avid reader and loves creating lasting memories with his family.',
        credentials: [
          'Graduate of Loyola University Chicago',
          'Former professional volleyball athlete',
          'Specializes in generational wealth strategies',
          'Expert in trusts, wills, and investment strategies',
          'Experienced in estate planning complexities'
        ]
      },
      {
        name: 'Mo Dadkhah',
        description: 'Mo Dadkhah is the broker owner of Main Street Real Estate Group and for the last fifteen years has focused his attention primarily on estate planning, real estate, and corporate law. Mo has been named a Top 50 Attorney by the Top 100 Magazine, his Firm has been selected as an Inc. 5000 list of fastest-growing companies, and he has been named as a Chicago Agent Magazine Who\'s Who for seven consecutive years. He has also been the host of WGN\'s Market Overdrive radio show. Mo brings a wide range of knowledge in estate planning, real estate, and corporate law together to best guide his clients on how to best protect themselves.',
        credentials: [
          'Broker owner of Main Street Real Estate Group',
          '15+ years focused on estate planning, real estate, and corporate law',
          'Named Top 50 Attorney by Top 100 Magazine',
          'Inc. 5000 fastest-growing companies list',
          'Chicago Agent Magazine Who\'s Who for 7 consecutive years',
          'Host of WGN\'s Market Overdrive radio show'
        ]
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