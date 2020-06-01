# FTDOCS Build Actions

This repo contans the action code which is run against new PRs submitted to the fasttrack-docs content repo.
It considers the following items:

- Ensures all file names conform to naming convention
- Ensures no disallowed file types are included in the PR
- Ensures no files exceed 1 MB
- Hilights any changes to root level files or folders

## Making Changes

Changes to this repo must be built locally and then pushed to the branch.

For information about preparing your local clone for building, there
is a good overview [here](https://help.github.com/en/actions/creating-actions/creating-a-javascript-action).

Required NPM Packages:

- @actions/core@1.2.4
- @actions/github@2.1.1
- @octokit/action@1.3.0
- @types/js-yaml@3.12.4
- @types/minimatch@3.0.3
- @zeit/ncc@0.21.1
- bufferutil@4.0.1
- canvas@2.6.1
- jest@26.0.1
- js-yaml@3.13.1
- minimatch@3.0.4
- semver@7.3.2
- utf-8-validate@5.0.2

Once your environment is set up and your changes are ready to build, run the following command
to compile all of the necessary scripting into a single file, `index.js`:

`ncc build src\main.ts`

## Required Action Inputs

**repo-token**
The GITHUB_TOKEN secret. This value is set and retrieved automatically, the reference just needs to be included.

**file-size-limit**:**
Maximum file size in bytes. Default is 1 MB.

## Example usage

``` yml
  run_filechecks:
    runs-on: ubuntu-latest
    name: Validate Files
    env:
      GITHUB_TOKEN: ${{secrets.GITHUB_TOKEN}}
    steps:
    - name: Check file names and types
      id: filevalidate
      uses: microsoft/fasttrack-docs-actions@master
      with:
        repo-token: "${{ secrets.GITHUB_TOKEN }}"
        file-size-limit: "1048576" # 1MB
        configuration-path: "some/path"
```
