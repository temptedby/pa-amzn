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
