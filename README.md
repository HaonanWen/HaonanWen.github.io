# Haonan Wen Homepage

This is a static GitHub Pages homepage inspired by the AcademicPages-style
layout used at <https://viryzw.github.io/>.

## What was collected

- OpenReview profile: name, GitHub, ORCID, BJTU education history, and research expertise.
- GitHub profile: public avatar URL.
- Google Scholar: linked as the authoritative live publication source. Automated
  fetching was blocked from this environment, so publications are not fabricated.

## Publish on GitHub Pages

1. Create or open the repository named `HaonanWen.github.io`.
2. Put these files at the repository root.
3. Commit and push to the `main` branch.
4. In GitHub, enable Pages from `main` / root if it is not enabled automatically.

## Update Data

Run the helper script from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-openreview.ps1
```

It writes the current OpenReview profile JSON to `data/openreview-profile.json`.
