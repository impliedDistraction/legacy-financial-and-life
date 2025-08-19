# Copilot Instructions for Legacy Financial & Life

## Project Overview
This is a professional insurance agency website built with Astro and Tailwind CSS. The site represents Legacy Financial & Life, an insurance agency run by Tim & Beth Byrd, specializing in life insurance, retirement planning, and financial protection services.

## Technology Stack
- **Framework**: Astro 4.15+ (Static Site Generator)
- **Styling**: Tailwind CSS with custom brand colors
- **Language**: TypeScript
- **Build Tool**: Astro's built-in Vite-based build system
- **Package Manager**: npm

## Project Structure
```
legacyf-l/
├─ .github/                 # GitHub configuration
├─ public/                  # Static assets (favicon, images)
├─ src/
│  ├─ components/          # Reusable Astro components
│  ├─ content/            # Content configuration (site.ts)
│  ├─ layouts/            # Page layouts
│  ├─ pages/              # Route pages
│  └─ styles/             # Global styles
├─ astro.config.mjs       # Astro configuration
├─ tailwind.config.cjs    # Tailwind configuration
├─ tsconfig.json          # TypeScript configuration
└─ package.json           # Dependencies and scripts
```

## Key Design Principles
1. **Performance First**: Zero JavaScript by default, minimal CSS bundle
2. **Accessibility**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support
3. **Trust & Professionalism**: Clean design appropriate for financial services
4. **Mobile-First**: Responsive design that works on all devices
5. **SEO Optimized**: Semantic HTML, structured data, meta tags

## Brand Guidelines
- **Primary Colors**: Custom blue theme (`brand-50` to `brand-900`)
- **Typography**: Sans-serif system fonts for readability
- **Tone**: Professional, trustworthy, approachable
- **Content Focus**: Life insurance, retirement planning, financial protection

## Component Architecture
- **Header.astro**: Sticky navigation with call-to-action button
- **Hero.astro**: Main headline with dual CTA buttons
- **FeatureCards.astro**: Service offerings display
- **Team.astro**: Tim & Beth Byrd introduction
- **ContactForm.astro**: Formspree-integrated contact form
- **Footer.astro**: Simple navigation and legal links
- **SEO.astro**: Meta tags and structured data

## Content Management
- All site content is centralized in `src/content/site.ts`
- Easy to update contact information, messaging, and team details
- Structured data for search engines included

## Development Commands
- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run preview`: Preview production build locally

## Best Practices for Contributing
1. **Components**: Keep components small and focused on single responsibility
2. **Styling**: Use Tailwind utility classes, avoid custom CSS unless necessary
3. **Content**: Update content through `src/content/site.ts`, not hardcoded in components
4. **Performance**: Always consider Core Web Vitals impact of changes
5. **Accessibility**: Test with keyboard navigation and screen readers
6. **SEO**: Maintain semantic HTML structure and meta tags

## Common Tasks
- **Update Contact Info**: Edit `src/content/site.ts`
- **Add New Page**: Create `.astro` file in `src/pages/`
- **Modify Styling**: Update Tailwind classes or `tailwind.config.cjs`
- **Change Form Handler**: Update action URL in `ContactForm.astro`
- **Add Images**: Place in `public/` directory, reference with `/filename.ext`

## Deployment
The site is optimized for static hosting platforms like Vercel, Netlify, or GitHub Pages. The build process generates optimized static assets with no server requirements.

## Important Notes
- This is a business-critical website for an insurance agency
- Maintain professional appearance and accurate contact information
- Test all changes on mobile and desktop before deploying
- Ensure forms continue to work after any modifications
- Follow insurance industry compliance guidelines for content