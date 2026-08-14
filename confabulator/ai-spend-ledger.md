# AI generation spend, billed to Social Scene, rebilled to PA-AMZN

William approved on 2026-08-12: "yes thats fine just keep track and social scene can charge PA".

The credential is Social Scene's fal.ai account, so Social Scene pays the vendor and invoices
PA-AMZN. Every row below is a REAL balance delta read from fal before and after the call, not a
published rate card. Total at the bottom is what Social Scene should charge.

| when (UTC) | out | model | cost |
|---|---|---|---|
| 2026-08-12 11:38 | kevin-jeans.mp4 | kling-video/v1.6 | $0.2800 |
| 2026-08-12 11:47 | meda48-purse.mp4 | kling-video/v1.6 | $0.2800 |
| 2026-08-12 11:47 | ca-in-ca-pocket.mp4 | kling-video/v1.6 | $0.2800 |
| 2026-08-12 11:47 | adam3914-water.mp4 | kling-video/v1.6 | $0.2800 |

**Batch 1 total: $1.12 for 4 clips, $0.28 each.** fal balance 8.298065 -> 7.178065, read directly.

Two measurement notes, both worth keeping:
- fal's balance SETTLES about a minute after a job completes. Read it immediately and it returns the
  pre-charge figure. The first clip logged $0.0000 that way and actually cost $0.28.
- Running three jobs concurrently makes per-clip deltas overlap, so one row briefly read $0.56 and
  another $0.28 for identical work. The batch total against the opening balance is the number to
  trust; per-clip is only reliable when the clips run one at a time.

**Yield: 3 of 4 usable.** `ca-in-ca-pocket.mp4` was rejected on sight: the model erased our clip off
the waistband partway through and reshaped the phone. That is the failure mode to watch for. The
first frame is ours; everything after it is the model's opinion, and it will edit our hardware if the
hardware is small in frame.
| 2026-08-12 15:40 | kevin-cord-length.mp4 | kling-video/v1.6 | $0.2800 |
| 2026-08-12 15:40 | david-phone-hands.mp4 | kling-video/v1.6 | $0.2800 |

---

## Batch 2, 2026-08-12: testing William's direction

Two clips, $0.56. Running total **$1.73 across 6 clips**, fal balance 8.298065 -> 6.565565.

William's notes after seeing batch 1: *"you created this dingy string on the phone... I don't
understand the movement of the second one long enough for the core because she's not even extending
her hand... I think the girl with the purse is really the only one that works."*

Two rules came out of that and both were tested:

| test | rule | result |
|---|---|---|
| `david-phone-hands` | product LARGE in frame | **works.** Cord and tether tab render clean for the full five seconds, thumb scrolls, nothing invented |
| `kevin-cord-length` | motion must DEMONSTRATE the claim | **rejected.** Asked for the arm to extend outward and showed the cord playing out; the model raised the phone instead and it reads as taking a photo |

**The dingy string is a size problem, not a model problem.** Every clip where the cord is thin in
frame degrades it. Every clip where the hardware is large renders it properly. That is now the
selection rule: if the tether is small in the frame, do not animate that frame.

**Motion prompts are unreliable for anything directional.** "Extends further away" became "raises
up". Kling honours mood and small gestures; it does not honour a specific vector. Prefer frames
where the useful motion is what the subject would do anyway.

Yield to date: 4 usable of 6, $0.43 per usable clip.
