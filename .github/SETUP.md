# Development Setup Steps

This document provides step-by-step instructions for setting up the Legacy Financial & Life website development environment.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software
- **Node.js** (version 18.0.0 or higher)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm** (comes with Node.js)
  - Verify installation: `npm --version`
- **Git** (for version control)
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify installation: `git --version`

### Recommended Tools
- **Visual Studio Code** with the following extensions:
  - Astro (astro-build.astro-vscode)
  - Tailwind CSS IntelliSense (bradlc.vscode-tailwindcss)
  - TypeScript and JavaScript Language Features (built-in)
  - Prettier - Code formatter (esbenp.prettier-vscode)

## Initial Setup

### 1. Clone the Repository
```bash
git clone https://github.com/impliedDistraction/legacy-financial-and-life.git
cd legacy-financial-and-life
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
No environment variables are required for basic development. However, for the contact form to work, you'll need to:

1. Sign up for a [Formspree](https://formspree.io) account
2. Create a new form and get your form ID
3. Update the form action URL in `src/components/ContactForm.astro`

### 4. Start Development Server
```bash
npm run dev
```

The site will be available at `http://localhost:4321`

## Development Workflow

### Daily Development
1. Pull latest changes: `git pull origin main`
2. Install any new dependencies: `npm install`
3. Start development server: `npm run dev`
4. Make your changes
5. Test build: `npm run build`
6. Commit and push changes

### Testing Your Changes
Before committing, always run:
```bash
# Type check
npx astro check

# Build test
npm run build

# Preview production build
npm run preview
```

### Key Files to Know
- `src/content/site.ts` - Site content and configuration
- `src/components/` - Reusable UI components
- `src/pages/index.astro` - Homepage
- `src/layouts/Base.astro` - Main page layout
- `tailwind.config.cjs` - Styling configuration
- `astro.config.mjs` - Astro configuration

## Deployment Setup

### Option 1: Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Vercel will automatically detect Astro and configure build settings
3. Deploy with zero configuration

### Option 2: Netlify
1. Connect your GitHub repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`

### Option 3: GitHub Pages
1. Enable GitHub Pages in repository settings
2. The included GitHub Action will automatically build and deploy

## Content Updates

### Updating Site Information
Edit `src/content/site.ts` to update:
- Company contact information
- Team member details
- Service descriptions
- Hero section content

### Adding New Pages
1. Create a new `.astro` file in `src/pages/`
2. Use the existing layout: `import Base from '../layouts/Base.astro'`
3. Add navigation links in `src/components/Header.astro`

### Customizing Styles
- Modify brand colors in `tailwind.config.cjs`
- Add custom CSS in `src/styles/tailwind.css`
- Use Tailwind utility classes for component styling

## Troubleshooting

### Common Issues

**Port already in use**
```bash
# Kill process on port 4321
lsof -ti:4321 | xargs kill -9
```

**Build fails**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Type errors**
```bash
# Run type check for detailed errors
npx astro check
```

### Performance Tips
- Use `npm run preview` to test production performance
- Check Core Web Vitals with browser dev tools
- Optimize images in the `public/` directory

## Contributing Guidelines

1. **Branching**: Create feature branches from `main`
2. **Commits**: Use descriptive commit messages
3. **Testing**: Always test builds before pushing
4. **Code Style**: Follow existing Tailwind and Astro patterns
5. **Content**: Keep professional tone appropriate for insurance industry

## Support

For development questions or issues:
1. Check this documentation
2. Review Astro documentation: [docs.astro.build](https://docs.astro.build)
3. Check Tailwind CSS documentation: [tailwindcss.com](https://tailwindcss.com)
4. Open an issue in the GitHub repository