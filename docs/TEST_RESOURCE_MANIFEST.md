# Test resource manifest

## Live proof source

Each covenant seals `owner/repository`, base branch, production prefix, test prefix and acceptance criteria before funding. A contributor supplies only the PR number.

The contract derives these facts from GitHub-controlled API endpoints:

```text
GET https://api.github.com/repos/{owner}/{repo}/pulls/{pr}
GET https://api.github.com/repos/{owner}/{repo}/commits/{merge_sha}
GET https://api.github.com/repos/{owner}/{repo}/pulls/{pr}/files?per_page=100&page={1..3}
GET https://raw.githubusercontent.com/{owner}/{repo}/{merge_sha}/{required_path}
```

Observed fields are PR `merged/state`, base ref, head SHA, merge SHA, canonical commit SHA and changed-file records. Every selected production/test artifact must include GitHub's PR patch together with status and addition/deletion counts. Validators evaluate work demonstrated by that patch and use the exact blob at the full merge SHA only as context; code already present outside the PR cannot satisfy a milestone. Both patch and blob digests are retained. Missing/truncated patches fail closed. The implementation caps complete file pagination at 300 entries, rejects a full third page as truncated, caps required artifacts at 12 and each patch/blob at 120 KB, and fails closed for unavailable, oversized or malformed responses.

## Controlled local source

Direct Mode tests replace `_github_snapshot` and `_assess` only at the nondeterministic boundary. The contract's real public methods, sender binding, attached value, state transitions, storage and accounting are executed. Synthetic snapshots are not presented as GitHub or live validator evidence.

## Poisoned controls

- Valid PR identity with documentation-only changes → `INSUFFICIENT`.
- Production path without regression-test path → `INSUFFICIENT`.
- Unavailable GitHub response → `SOURCE_UNAVAILABLE`, no credit.
- Wrong actor/value/deadline → rejected with exact pre/post equality.

## Limitations

Changed paths and semantic diff relevance do not prove CI ran, deployment occurred, or code is safe. A later version must add commit-bound GitHub Checks verification before claiming CI success.
