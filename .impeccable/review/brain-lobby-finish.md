disposition: recapture

## recapture

- `.impeccable/review/desktop.png`: the existing file predates this new Brain Duel lobby and is historical evidence only. Replace it with a current desktop capture showing the authenticated host setup, topic/custom-topic selection, Easy/Medium/Hard and 3/5/10 controls, both players' presence/readiness, and the start gate.
- `.impeccable/review/mobile.png`: the existing file predates this new Brain Duel lobby and is historical evidence only. Replace it with a current mobile capture of the same new surface, with readable labels and usable controls. Include the guest's host-chosen summary and join/readiness state as supplemental evidence.
- Capture current preparing, offline/error recovery, active paired-answer and finished states at the applicable desktop/mobile viewports. The original user screenshot shows the old brain station and cannot certify the new surface.

The session's localhost browser restriction prevents collecting valid local captures and must be respected. This review does not certify visual rendering, responsive behavior, contrast or the deployed interface. A full visual re-review is required once current captures are available.

Source-only follow-up (no visual verdict pass): the existing-membership refresh issue is resolved by reconciling `joined.current` from each successful returned lobby. Move failures are now caught and surfaced through `setError`, then rethrown for the caller. Report failures returned or thrown by the RPC are now caught and surfaced with recovery copy. Successful reports use a separate neutral notice with role=status. Both material source findings are resolved within this inspected scope. These source checks do not alter disposition: recapture.

