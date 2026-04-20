# Phone Assured — Amazon Automation PRD

## Overview
Automated Amazon Seller Central management for Phone Assured phone clips.
Handles: ad bid management, keyword harvesting, inventory alerts, campaign optimization.

**Domain:** phoneassured.com (subdomain: amzn.phoneassured.com)
**Email:** hello@phoneassured.com
**Products:** Phone clips — single black, 2-pack black, 3-pack black, 1-pack pro clip
**Price point:** $9.49/unit (low margin — every ad dollar matters)

## APIs Required

### 1. Amazon Selling Partner API (SP-API)
- Inventory tracking (FBA levels per SKU)
- Order management
- Reports (sales, returns)
- **Registration:** Seller Central → Apps & Services → Develop Apps

### 2. Amazon Advertising API
- Campaign management (Sponsored Products)
- Keyword management (add/remove/adjust bids)
- Search term reports
- **Registration:** advertising.amazon.com/about-api

---

## Feature 1: Inventory Notifications

### What
Email hello@phoneassured.com when FBA inventory drops below threshold per SKU.

### SKUs to Monitor
| SKU | Product | Threshold |
|-----|---------|-----------|
| Single Black Clip | 1-pack black | TBD |
| 2-Pack Black Clip | 2-pack black | TBD |
| 3-Pack Black Clip | 3-pack black | TBD |
| Pro Clip | 1-pack pro | TBD |

### How
- Cron job checks FBA Inventory API daily (or every 6 hours)
- If quantity < threshold → send email
- Email: "Ship additional [SKU name] to Amazon FBA — current stock: X units"

---

## Feature 2: Bid Management (ACOS-Based Rules)

### Rules
| Condition | Action |
|-----------|--------|
| Keyword spent > $4 with no sale | **Turn OFF keyword** |
| ACOS < 10% | Increase bid 20% |
| ACOS < 20% | Increase bid 15% |
| ACOS < 30% | Increase bid 10% |
| ACOS 30-50% | Leave as is (acceptable) |
| ACOS > 50% | Evaluate — decrease or pause |
| Keyword not spending (bid too low) | Increase bid 10% until it starts spending, up to $4 max total spend |

### How
- Pull keyword performance data from Advertising API
- Apply rules automatically
- Log all changes for audit trail
- Run daily (or on-demand)

---

## Feature 3: Keyword Harvesting (Broad → Exact/Phrase)

### What
Monitor search terms in broad match campaigns. When a search term converts well, add it as an exact or phrase match keyword in manual campaigns.

### Rules
| Condition | Action |
|-----------|--------|
| Search term ACOS < 50% with 2+ sales | Add as exact match, starting bid $0.37 |
| Search term ACOS < 30% with 2+ sales | Add as phrase match too, starting bid $0.37 |
| Search term already exists as exact/phrase | Skip (don't duplicate) |

### How
- Pull Search Term Report from Advertising API (last 14 days)
- Find converting terms not yet in manual campaigns
- Auto-add with starting bid of $0.37
- Then apply ACOS-based bid rules going forward

---

## Feature 4: Campaign Optimization

### What
- Turn off underperforming keywords automatically
- Surface top performers for review
- Suggest new campaign structures based on performing search terms

### Dashboard Shows
- All active campaigns with ACOS, spend, sales, impressions, clicks
- Keywords sorted by performance (best ACOS first)
- Recently added keywords from harvesting
- Recently turned off keywords
- Inventory status per SKU

---

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+ (App Router), React, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | SQLite (dev) / Turso (production) |
| Amazon SP-API | inventory, orders, reports |
| Amazon Ads API | campaigns, keywords, search terms, bids |
| Email | Resend (hello@phoneassured.com notifications) |
| Hosting | Vercel (amzn.phoneassured.com) |
| Auth | Password-protected (same as WIS) |

---

## Setup Steps

### Step 1: Amazon SP-API Registration
1. Log in to Seller Central with Phone Assured account
2. Navigate to Apps & Services → Develop Apps
3. Create developer profile (private seller application)
4. Create app → get Client ID + Client Secret
5. Self-authorize the app → get Refresh Token
6. Save credentials to .env

### Step 2: Amazon Advertising API Registration
1. Go to advertising.amazon.com/about-api
2. Log in with Amazon account
3. Apply for API access (select "self-service")
4. Get Client ID + Client Secret
5. Authorize for the Phone Assured ad account
6. Save credentials to .env

### Step 3: Deploy
1. Set up Turso database
2. Deploy to Vercel
3. Connect amzn.phoneassured.com subdomain
4. Set up cron jobs for inventory checks + bid management
