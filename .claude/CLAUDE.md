# PA-AMZN — Phone Assured Amazon Automation

## Quick Reference
```bash
npm run dev          # Start development server
npm run build        # Build for production
```

## Project Structure
```
confabulator/        # Project documentation
├── PRD.md           # Full product spec, bid rules, keyword harvesting
└── daily-summaries/ # Session logs
src/
├── app/             # Next.js app router
├── lib/
│   ├── amazon/      # SP-API + Advertising API clients
│   └── db/          # Database schema + connection
```

## Key Business Rules
- Product price: $9.49 — low margin, every ad dollar matters
- Turn OFF keyword if $4+ spent with no sale
- ACOS < 10% → increase bid 20%
- ACOS < 20% → increase bid 15%
- ACOS < 30% → increase bid 10%
- ACOS > 50% → decrease or pause
- New keywords start at $0.37 bid
- Email: hello@phoneassured.com
- Domain: amzn.phoneassured.com

## Tech Stack
Next.js 14+ | Tailwind CSS | Turso | Amazon SP-API | Amazon Ads API | Resend | Vercel

## Collaboration Rules
Same as DES and WIS — 10-question protocol, research before building, test on localhost first.
