# The Social Scene build system: rules, tools, and how a day actually gets made

Written 2026-08-11 for the PA-AMZN agent, at William's request: "a quick memory doc of all BRC and
ways and tools and anything more you use to build social media and graphics and videos."

Companion doc: `media-build-lessons-from-social-scene.md` in this folder covers the *craft* lessons
(framing, faces, thumbnails, audio). **This doc covers the SYSTEM**: the rulebook, the keywords, the
scripts, the data files, and the order things happen in.

⚠ **Two-companies rule applies.** Social Scene and PA-AMZN are separate businesses. Never combine
their data in one report, dashboard, email or surface. This doc transfers METHOD, not data.

---

## 1. The BRC is the rulebook, and it is unusual

`~/projects/social-scene/research/pre-post-checklist.md`, currently **2,768 lines and 336 numbered
rules**. Three properties worth understanding before you copy the idea:

- **Append-only.** Rules are never edited in place. When something changes, a NEW numbered rule is
  appended saying what it supersedes.
- **Newest rule wins.** Because of the above, older rules in the file may be actively stale. There is
  a CANONICAL INDEX at the top listing which rules win on contested topics.
- **Every rule names the failure that caused it.** Not "use good framing" but "on 2026-08-03 I
  reported 60 graphics clean on a text audit and William immediately found cut-off heads." That is
  what makes them believable and memorable a month later.

**Why this shape works.** A rule with a story attached gets followed. A rule without one gets
rationalised away. If you build an equivalent for PA-AMZN, keep the failure attached to the rule.

**The cost, honestly:** at 2,768 lines a full read is expensive, and there are known duplicate and
stale rules. It needs consolidation and has for months. Start yours consolidated.

---

## 2. The keyword commands

William drives everything through short typed keywords. These are worth stealing wholesale.

| Keyword | Means | What it triggers |
|---|---|---|
| **BRC** | Build Review Check | Re-read the rules FRESH before building or sourcing anything. Never from memory. |
| **MR** | Morning Review | 2 weeks of transcripts + journals + daily summaries + the full rulebook + the daily quota check. Scoped to THIS project only. |
| **SJC** | Summary, Journal, Commit | Write the daily summary, append a journal entry, commit and push. |
| **SJCC** | ...and Compact | Same plus compact the context. |
| **SSC** | Schedule Save Content | Scheduling must PERSIST the content, not just the intent. See §5. |
| **CBC** | Confirm Before Claim | Never say done/fired/fixed/fresh until verified against the real source. |
| **TBA** | Talk Before Action | If the work is not the work that was asked for, discuss BEFORE doing it. |
| **RBB** | Research Before Build | No build on assumption. Understand what exists, research the standard, verify access. |
| **ES** | Email Sweep | Inbox triage pass. |

**CBC and TBA are the two that matter most** and they govern different things: CBC governs what you
CLAIM, TBA governs what you DO.

---

## 3. The daily quota: what "a complete day" means

Defined so a missing item counts as a **failure, not silence**. This exists because the nightcap
shipped only twice in eleven days and nobody noticed, since a missing row looks identical to a quiet
night.

- 4 social posts, each to 4 surfaces (IG feed, IG story, FB feed, FB story)
- 1 nightcap: a collage thumbnail AND a slideshow, carrying real audio
- 3 YouTube, 3 TikTok

Checked by `node scripts/_daily-quota-check.mjs [YYYY-MM-DD]` in the DES repo, which reads the REAL
sources (database rows, the YouTube API, Buffer) and never a ledger.

**Transferable principle:** define what "done" is numerically, and check it against the system of
record rather than against your own notes.

---

## 4. The content structure: series, rotation, no-repeat

**9 named series**, each with a standing hashtag, so the feed becomes something followable rather
than a stream of ads: Meet the Pour (brand/bottle spotlight), Beyond the Basics (education), The
Countdown (urgency), Past Pours (throwback), The Vibe (crowd energy), Set the Scene (venue), Roll the
Tape (UGC/recap), Behind the Pour (BTS), Bring Your Crew (engagement).

**Rotation rules that prevent same-y feeds:**
- No series repeats within a day, and not back-to-back across days.
- No template repeats within a day. Swapping the PALETTE is not a different template.
- No asset appears twice in one day, including across slideshows.
- 30-day hard floor on reusing any source, 365-day target.
- Brand tags rotate so every partner gets turns over a week.

**The trap I hit today, worth transferring:** the "last used" column in the clip library was WRONG.
It said unused for a clip whose source had posted two days earlier. William caught it by eye. **Trust
the real build records over a convenience column**, and remember that a different segment of the same
shoot still reads as a repeat to a human.

---

## 5. SSC: scheduling must persist the content

**The failure.** A full day of approved posts rendered into `/private/tmp`. macOS clears that on
reboot. William restarted the machine and all of it was destroyed. Nothing errored, because rendering
and persisting were two separate steps and only the first was automatic.

**The fix.** One script that uploads to blob storage, inserts the database rows, **verifies the count**,
and writes the URLs back. Persistence is a side effect of scheduling, not a human step.

**And the second half matters as much:** "scheduled" now means a **verified row count**. Zero rows
and twelve rows looked identical all day and nobody could tell.

**For PA-AMZN:** anything approved must land in durable storage as part of the approval, and any
"done" claim must be a read-back, not a write-and-assume. Never render deliverables into a temp dir.

---

## 6. The tools, by job

Paths are `~/projects/social-scene/scripts/` unless noted.

**Sourcing**
- `social-scene-clip-library.py {index|check|list}` — tagged, fingerprinted, timecoded clips
- `social-scene-catalog-index.py query --event X --kind photo --city Y` — fast catalog query
- `yt-dlp` — pulls from our own YouTube back catalogue, which is the deepest untapped archive we own

**Cleaning**
- `social-scene-rebrand-banner.py` — opaque band over dead domains/logos
- ffmpeg `crop` — preferred over bannering when you can afford the pixels
- `social-scene-transcribe-local.py` — whisper, gives TIMED text so cuts land on sentence boundaries

**Building**
- `social-scene-video-post.py <config.json>` — THE video builder. Clip goes WHOLE into a framed
  window on a designed background, so a face can never be cropped. Themes per product type.
- `ss-event-graphics.py` — event graphics, layered so the scene can animate independently
- `ss-two-bottle-motion.py` — compositing-based motion, deliberately NOT AI video
- `ss-nightcap-*.py` — the daily recap collage and slideshow

**Gating**
- `social-scene-face-safety.py scan <dir>` — OpenCV, hard-fails top-crop / cut-face / text-on-face
- `social-scene-caption-qa.py` — energy, local, positive-comedy, tag counts
- `social-scene-preflight.py` — runs every enforceable filter in one pass

**Publishing**
- Posts are inserted as rows and published by a deployed cron. **Never post directly from the agent.**
- A per-day queue script with guards that `process.exit(1)` on any violation. See §7.

**Data files that are the source of truth**
- `data/brand-handles-verified.json` — live-checked handles. A roster file is NOT sufficient.
- `data/verified-hashtags.json` — approved tags plus a refresh date
- `data/backed-out-brands.json` — never tag these again
- `data/social-data.db` — cross-channel post archive with fingerprints

---

## 7. Guards in the queue script, not in my head

This is the most transferable engineering idea in the whole system. The publish script refuses to run
if anything is wrong, and each guard exists because that exact thing shipped once:

```js
if (cap.includes('—')) exit('EM-DASH');                    // William bans em-dashes
if (nIgHashtags !== 5) exit('IG must be exactly 5');        // platform hard cap
if (/zanzibar/i.test(cap)) exit('venue is dead');           // stale venue shipped once
for (const dead of BACKED_OUT) if (cap.includes(dead)) exit('backed-out brand tagged');
if (!audioStream) exit('NO AUDIO');                          // a builder silently stripped audio
if (duplicateCategory > 0) exit('ALREADY QUEUED');           // double-queue double-posted a slot
```

Then it **reads the rows back and counts them** before reporting success.

**Principle:** every lesson learned should become an assertion in code, not a note to be careful.
"Be more careful" is the control that has failed most often.

---

## 8. Platform rules that are non-obvious and cost real money

- **TikTok silently stalls alcohol content.** It returns `Media container not ready on retry 12`,
  which READS like a media-processing fault and is not one. Measured: booze/brand/bottle posts 0 sent
  / 5 errored; people/venue/experience 5 sent / 0 errored, zero exceptions. **A container timeout on
  TikTok is a content flag. Never retry it, never re-encode it.** TikTok gets its own build.
- **Facebook strips @mentions.** Every brand handle on Instagram must become a #hashtag on Facebook
  or the brand gets nothing.
- **Instagram caps hashtags at 5** since Dec 2025 and has de-ranked them as a reach signal. Handles
  are now the primary organic lever.
- **Mid-tier hashtags (10K–500K posts) beat mega-tags**, and Instagram cross-references hashtags
  against the visual content, so incoherent tags actively cut reach. (Researched 2026-08-11.)
- **Meta age-gates alcohol rather than removing it**, with an explicit exception for inviting people
  to a venue event. Framing changes the outcome; a disclaimer in the caption does nothing because
  enforcement is automated.
- **Never name a price** in any caption or description, because dynamic pricing moves it and you end
  up advertising a price you do not honour. Name tiers, or point at the live page. Discount CODES and
  percentages are fine because we set them.

**PA-AMZN parallel:** Amazon has its own equivalents (main-image compliance, restricted claims,
review solicitation rules). The lesson is that each platform has silent failure modes that look like
technical errors, and finding them requires measuring outcomes by content type, not reading docs.

---

## 9. Measurement discipline, learned the hard way

Three instruments were silently returning zeros at the same time, and each produced a confident,
business-sounding, WRONG answer:

- A script read a credential from the wrong repo, sent an empty token, and reported "0 attendees" as
  a finding rather than an auth failure.
- A filter parameter was silently IGNORED by an API, returning the unfiltered set with a 200, so two
  different queries returned identical results.
- One invalid metric name in a Facebook insights request made the API reject the WHOLE request, so
  every video read 0 views for six weeks, and a strategic rule got written on that false premise.

**Rules that came out of it:**
- Validate any credential with a real call and ABORT on failure. Never let a loop convert an error
  into a count.
- If two different queries return identical results, suspect the filter before believing the finding.
- If a metric reads exactly zero across an entire population, suspect the query before the world.
- For anything billable, divide REAL charges. Never quote a price field from an API.

---

## 10. The honest meta-lessons

Worth more than any tool:

1. **Reuse beats rebuild.** I wrote three renderers before checking whether the right one existed. It
   did. Inventory first, every time.
2. **Settle the structural constraint before iterating on taste.** Six separate "cut face" complaints
   were one geometry bug. Per-asset patching was never going to converge.
3. **Ship the slot, refine after.** Four of five rebuilds on one post were MY objections, not
   William's, on a thing he had already said he did not care about. A concern is one sentence, then
   his call.
4. **The operator's knowledge is part of the inventory.** When William says his tool does something
   ordinary, the prior should be that it does and I have not found it. He was right and I was wrong
   on this at least three times.
5. **A green check is not approval.** Show the actual artifact and let him look.

---

*Source system: `~/projects/social-scene/`. Rulebook: `research/pre-post-checklist.md`.
Journal: `~/projects/dynamic-event-suite/confabulator/decisions-journal.md`.*
