# Legacy Financial & Life (Astro + Tailwind)

A fast, respectful insurance site designed for clarity, trust, and accessibility.

## Quick start (no CLI needed)
1. Create this repo on GitHub and add the files above using **Add file → Create new file**.
2. Go to **Vercel → New Project → Import GitHub Repo** and deploy.
3. In `astro.config.mjs`, update `site` to your deployed URL.
4. In `src/content/site.ts`, update `phone`, `email`, location, and copy.
5. In `ContactForm.astro`, replace the Formspree action with your form ID.

## Why it's faster
- Astro ships **zero JS by default**; this page renders as static HTML.
- Tailwind is purged at build → tiny CSS.
- Minimal third-party scripts. Lazy images recommended.
- Great Core Web Vitals out of the box.

## SEO & schema
- OpenGraph + Twitter tags in `SEO.astro`.
- `InsuranceAgency` JSON-LD injected.

## Accessibility
- Good color contrast, large touch targets, focus-safe nav, reduced-motion friendly.

## Development

Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Customization

### Update site content
Edit `src/content/site.ts` to customize:
- Company information (name, phone, email, location)
- Hero section content
- Feature cards
- Team information
- Contact form messaging

### Update styling
- Brand colors are defined in `tailwind.config.cjs`
- Custom styles can be added to `src/styles/tailwind.css`

### Contact form setup
1. Sign up for [Formspree](https://formspree.io)
2. Create a new form and get your form ID
3. Replace `your-form-id` in `src/components/ContactForm.astro` with your actual form ID

## Deployment

This site is optimized for deployment on Vercel, but can be deployed anywhere that supports static sites:

1. **Vercel**: Connect your GitHub repo and deploy automatically
2. **Netlify**: Drag and drop the `dist` folder after running `npm run build`
3. **GitHub Pages**: Use GitHub Actions to build and deploy

## File Structure

```
legacyf-l/
├─ package.json
├─ astro.config.mjs
├─ tsconfig.json
├─ tailwind.config.cjs
├─ postcss.config.cjs
├─ public/
│  ├─ favicon.svg
│  └─ og-image.jpg
├─ src/
│  ├─ styles/
│  │  └─ tailwind.css
│  ├─ content/
│  │  └─ site.ts
│  ├─ layouts/
│  │  └─ Base.astro
│  ├─ components/
│  │  ├─ SEO.astro
│  │  ├─ Header.astro
│  │  ├─ Hero.astro
│  │  ├─ FeatureCards.astro
│  │  ├─ Team.astro
│  │  ├─ ContactForm.astro
│  │  └─ Footer.astro
│  └─ pages/
│     └─ index.astro
└─ README.md
```