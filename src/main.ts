import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';
import {Minimatch} from 'minimatch';

async function run() {
  try {
    core.info(`Starting file check run`);

    const token = core.getInput('repo-token', {required: true});
    const configPath = core.getInput('configuration-path', {required: true});
    const fileNameRegex = "^[a-z\d/\\-]+\.{1}[a-z]{1,4}" //core.getInput('filename-regex', {required: true});
    const fileExtRegex = core.getInput('fileext-regex', {required: true})
    const regexFileName = new RegExp("^[a-z\-\d]+.{1}[a-z]{1,4}$");
    //let regexFileExt = new RegExp("(?!\.{1})md|yml|jpg|png");
    const allowedExtensions = ['md', 'yml', 'jpg', 'png'];

    const prNumber = getPrNumber();
    if (!prNumber) {
      console.log('Could not get pull request number from context, exiting');
      return;
    }

    const client = new github.GitHub(token);

    core.info(`fetching changed files for pr #${prNumber}`);
    const changedFiles: string[] = await getChangedFiles(client, prNumber);

    core.info(`File name regex: ${fileNameRegex}`);
    core.info(`Allowed file extensions: ${allowedExtensions}`);
    //core.info(`File extension regex: ${fileExtRegex}`)

    let isError = false;
    for (const file of changedFiles) {
        let slash = file.lastIndexOf('/');
        let dot = file.lastIndexOf('.');
        let filename = file;
        let extension = '';

        if (slash >= 0)
        {
            filename = file.substring(slash + 1);
        }
        if (dot >= 0)
        {
            extension = file.substring(dot + 1);
        }

        core.debug(`Checking file: ${filename}`);
        core.debug(`Checking extension: ${extension}`);

        if (!regexFileName.test(filename))
        {
            core.info(file)
            core.error('Invalid file name: ' + filename);
            core.warning('File names must be all lowercase and cannot contain spaces or special characters.')
            isError = true;
        }

        if (!allowedExtensions.includes(extension))
        {
            core.info(filename)
            core.error('Invalid file extension: ' + filename);
            core.warning(`'${extension}' is not allowed.`);
            isError = true;
        }
      }

      if (isError)
      {
          core.setFailed("Found one or more file errors.");
      }

   /*
    const labelGlobs: Map<string, string[]> = await getLabelGlobs(
      client,
      configPath
    );

    const labels: string[] = [];
    for (const [label, globs] of labelGlobs.entries()) {
      core.debug(`processing ${label}`);
      if (checkGlobs(changedFiles, globs)) {
        labels.push(label);
      }
    }

    if (labels.length > 0) {
      await addLabels(client, prNumber, labels);
    }
    */
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function getPrNumber(): number | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    return undefined;
  }

  return pullRequest.number;
}

async function getChangedFiles(
  client: github.GitHub,
  prNumber: number
): Promise<string[]> {
    const clientListFiles = client.pulls.listFiles;
    const listFilesResponse = await clientListFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: prNumber,
      per_page: 100 // 100 is the max we can request at a time
    });

  const changedFiles = listFilesResponse.data.map(f => f.filename);

  core.info('found changed files:');
  for (const file of changedFiles) {
    core.info('  ' + file);
  }

  return changedFiles;
}

async function getLabelGlobs(
  client: github.GitHub,
  configurationPath: string
): Promise<Map<string, string[]>> {
  const configurationContent: string = await fetchContent(
    client,
    configurationPath
  );

  // loads (hopefully) a `{[label:string]: string | string[]}`, but is `any`:
  const configObject: any = yaml.safeLoad(configurationContent);

  // transform `any` => `Map<string,string[]>` or throw if yaml is malformed:
  return getLabelGlobMapFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string
): Promise<string> {
  const response: any = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha
  });

  return Buffer.from(response.data.content, response.data.encoding).toString();
}

function getLabelGlobMapFromObject(configObject: any): Map<string, string[]> {
  const labelGlobs: Map<string, string[]> = new Map();
  for (const label in configObject) {
    if (typeof configObject[label] === 'string') {
      labelGlobs.set(label, [configObject[label]]);
    } else if (configObject[label] instanceof Array) {
      labelGlobs.set(label, configObject[label]);
    } else {
      throw Error(
        `found unexpected type for label ${label} (should be string or array of globs)`
      );
    }
  }

  return labelGlobs;
}

function checkGlobs(changedFiles: string[], globs: string[]): boolean {
  for (const glob of globs) {
    core.debug(` checking pattern ${glob}`);
    const matcher = new Minimatch(glob);
    for (const changedFile of changedFiles) {
      core.debug(` - ${changedFile}`);
      if (matcher.match(changedFile)) {
        core.debug(` ${changedFile} matches`);
        return true;
      }
    }
  }
  return false;
}

async function addLabels(
  client: github.GitHub,
  prNumber: number,
  labels: string[]
) {
  await client.issues.addLabels({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber,
    labels: labels
  });
}

run();
