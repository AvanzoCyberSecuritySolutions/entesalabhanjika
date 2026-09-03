---
status: proposed
---

# Rewrite git history to remove the committed PNG scans

`.git` had grown to 224 MB across only 11 commits, almost entirely from page
scans committed as multi-megabyte PNGs (`images/Pages/` alone was 109 MB for
~22 files) and from 60 MB of PDFs. Because derived images are now generated at
build time and gitignored (see ADR-0002), and because the source scans are being
re-encoded to archival JPEG/WebP at roughly a tenth the size, the original PNG
blobs are dead weight that every clone would carry forever. We will re-encode the
sources and then purge the superseded blobs from history with `git-filter-repo`.

The deciding factor was timing. The repository has 11 commits, one branch, and
two contributors, which makes a rewrite a short coordinated task. That cost only
grows, so doing it now is materially cheaper than doing it later — and the
alternative is a permanent 224 MB clone for a site whose entire source is 90
files.

## Considered options

**Leave history alone and only stop the growth.** Zero risk, zero coordination.
Rejected because it permanently fixes the cost of cloning at 224 MB for no
ongoing benefit, when the window to fix it cheaply is open right now.

**Move sources to Git LFS.** Keeps originals at full fidelity and stops the
growth cleanly. Rejected as heavier than needed: it does not shrink the existing
history, adds an LFS bandwidth quota, and requires every contributor to install
git-lfs.

## Consequences

This rewrites published commits. It requires a force-push, it invalidates every
existing clone, and `athira2104` must re-clone rather than pull. Coolify's
auto-deploy must be paused before the force-push or its checkout will fail
against the rewritten branch. For those reasons this is sequenced last, after the
rebuild is verified on a preview deployment, and is executed only with explicit
confirmation at that moment — hence status `proposed` rather than `accepted`
until it is actually carried out.
