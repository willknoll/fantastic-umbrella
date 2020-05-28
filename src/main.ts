import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';
import {Minimatch} from 'minimatch';

const fileNameRegex = "^[a-z\-\d]+.{1}[a-z]{1,4}$";
const regexFileName = new RegExp(fileNameRegex);
const allowedExtensions = ['md', 'yml', 'jpg', 'png'];
const fileNameExceptions = ['README.md'];
const labelLargeFile = "lf-detected";
const labelRootDir = "new-root-dir";
const labelFileName = "invalid-file-name";
//TODO: Can we pull this list from the existing repo files instead?
const existingDirs = [
    '.git',
    '.github',
    'breadcrumb',
    'collateral',
    'contribute',
    'customer-health-data-quality-guide',
    'fasttrack-compliance-deployment-guide',
    'fasttrack-reporting-power-bi-access-guide',
    'ftc-help-guide',
    'ftc-insights',
    'ftc-resource-request-approver-user-guide',
    'ftc-resource-request-requester-user-guide',
    'ftc-survey-process-for-fy20',
    'ftcsme-bot-user-guide',
    'ftop-user-guide',
    'help-guides',
    'hr-connector-setup',
    'identity-and-device-security-guidance',
    'includes',
    'media',
    'mvm-reqtask-instructions',
    'obj',
    'onboarding-readiness',
    'partner-site',
    'partner-site-prelim',
    'pdf',
    'playbook',
    'playbook-prelim',
    'references',
    'release-readiness',
    'resources',
    'role-guide',
    'sfbo-to-teams-transition-roles-and-responsibilities',
    'useful-urls',
    'working-with-the-field'
];

// Universal error flag. If ever set to true, the whole action is set to fail
var isError = false;

// Label objects for any issues found
let largeFileLabelObject : {} = {};
let rootDirLabelObject : {} = {};
let fileNameLabelObject : {} = {};
let labels : string[] = []; // Array to hold all lables to add to the PR from this run, if any

// Main function that runs everything
async function run() {
  try {
    core.info(`Starting file and directory check run`);

    // Token is provided by the system
    const token = core.getInput('repo-token', {required: true});
    // Config path currently unused
    const configPath = core.getInput('configuration-path', {required: true});

    // If we don't find the Pull Request number, we can't proceed
    const prNumber = getPrNumber();
    if (!prNumber) {
      console.log('Could not get pull request number from context, exiting');
      return;
    }

    const client = new github.GitHub(token);
    const context = github.context;
    const { owner, repo } = context.repo;
    const event_type = context.eventName;
    const fileSizeLimit = core.getInput("file-size-limit");

    // Ensure labels exist
    let largeFileLabelObject = getLargeFileLabel(client, owner, repo);
    let rootDirLabelObject = getNewRootItemLabel(client, owner, repo);
    let fileNameLabelObject = getInvalidFileLabel(client, owner, repo);

    //const labels = ["lfs-detected"]

    // Print some basic information about our configuration
    core.info(`Name of Repository is ${repo} and the owner is ${owner}`)
    core.info(`Triggered event is ${event_type}`)
    core.info(`Using file name regex: ${fileNameRegex}`);
    core.info(`Allowed file extensions: ${allowedExtensions}`);
    core.info(`File name exceptions: ${fileNameExceptions}`);
    core.info(`Existing directories: ${existingDirs}`);
    core.info(`File size limit (bytes): ${fileSizeLimit}`);

    // Get list of all files changed in the PR
    core.info(`Fetching changed files for pr #${prNumber}`);
    const changedFiles: string[] = await getChangedFiles(client, prNumber);

    // Check to see if any new root level files or directories were created
    // Print an error for each new root fie or direcory found
    console.log("Inspecting directories...");
    let newRootDirs = validateDirectories(changedFiles);
    for (let newDir of newRootDirs)
    {
        core.error(`New root level directory '${newDir}' must be approved`);
    }

    // Check various filename properties for validity
    console.log("Validating files...");
    for (const file of changedFiles) {
        validateFile(file);
    }

    // Check file sizes
    console.log("Validating file sizes...");
    validateFileSizes(client, owner, repo, prNumber, fileSizeLimit);

    if (isError)
    {
        core.setFailed("Found one or more file errors.");
        // double-check that there are labels to add
        console.log(`Labels to add: ${labels}`);
        if (labels.length > 0) {
          await client.issues.addLabels({
            owner,
            repo,
            issue_number: prNumber,
            labels
          });
        }
    }

      // TODO:
      // git lfs attributes misconfiguration aka missing installation on client while git-lfs is configured on repo upstream

               
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

/*
function validateDirectories(file: string){
    let slash = file.indexOf('/');

    if (slash <= 0) {
      core.warning(file);
      core.error('Root level file changes must be approved.');
    } else {
      let dir = file.substring(0, slash);
      if (!existingDirs.includes(dir))
      {
        core.warning(file);
        newRootDirs.indexOf(dir) === -1 ? newRootDirs.push(dir) : core.debug(`${dir} already exists in new root dir array.`);
      }
    }
}
*/

// Ensure that all files found in the PR are not in a new top level directory or at the root themselves
function validateDirectories(files: string[]) : string[]{
  let foundNew : string[] = [];

  for (let file of files) {
    let slash = file.indexOf('/');
    if (slash <= 0) {
        // Found new root level file
        isError = true;
        core.warning(file);
        core.error('Root level file changes must be approved.');
        labels.indexOf(labelRootDir) === -1 ? labels.push(labelRootDir) : core.debug(`${labelRootDir} already exists in labels array`);
    } else {
        let dir = file.substring(0, slash);
        if (!existingDirs.includes(dir))
        {
            isError = true;
            core.warning(file);
            // Only add newly found directories once
            foundNew.indexOf(dir) === -1 ? foundNew.push(dir) : core.debug(`${dir} already exists in new root dir array.`);
            labels.indexOf(labelRootDir) === -1 ? labels.push(labelRootDir) : core.debug(`${labelRootDir} already exists in labels array`);
        }
    }
  }
  return foundNew;
}

function validateFile(file: string) {
    let slash = file.lastIndexOf('/');
    let dot = file.lastIndexOf('.');
    let filename = file;
    let extension = '';

    if (slash >= 0) {
        filename = file.substring(slash + 1);
    }
    if (dot >= 0) {
        extension = file.substring(dot + 1);
    }

    core.debug(`Checking file: ${filename}`);
    core.debug(`Checking extension: ${extension}`);

    // There are some system files which do not conform to our filename standards
    if (!fileNameExceptions.includes(filename)) {
        if (!regexFileName.test(filename)) {

            core.warning(file)
            //core.error('Invalid file name: ' + filename);
            core.error('File names must be all lowercase and cannot contain spaces or special characters.')
            labels.indexOf(labelFileName) === -1 ? labels.push(labelFileName) : core.debug(`${labelFileName} already exists in labels array`);
            isError = true;
        }
    }

    if (!allowedExtensions.includes(extension)) {
        core.warning(file)
        //core.error('Invalid file extension: ' + filename);
        core.error(`'${extension}' files are not allowed.`);
        labels.indexOf(labelFileName) === -1 ? labels.push(labelFileName) : core.debug(`${labelFileName} already exists in labels array`);
        isError = true;
    }
}

async function validateFileSizes(client: github.GitHub, owner: string, repo: string, prNumber: number, fsl: string)
{
//    console.log(`The PR number is: ${prNumber}`)
    const { data: pullRequest } = await client.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber
    })
    let newPRobj
        let prFilesWithBlobSize = await Promise.all(
          pullRequest.map(async function(item) {
            const { data: prFilesBlobs } = await client.git.getBlob({
              owner,
              repo,
              file_sha: item.sha
            })
            newPRobj = {
              filename: item.filename,
              filesha: item.sha,
              fileblobsize: prFilesBlobs.size
            }
            return newPRobj
          })
        )

    core.debug(prFilesWithBlobSize.toString())
    let lfsFile : string[] = [];
    for (let prop in prFilesWithBlobSize) {
      if (prFilesWithBlobSize[prop].fileblobsize > fsl) {
        lfsFile.push(prFilesWithBlobSize[prop].filename)
      }
    }
    if (lfsFile.length > 0) {
      if (lfsFile.length === 1) {
        core.warning("Detected large file:")
      } else {
        core.warning("Detected large files:")
      }
      for (let largeFile of lfsFile) {
        console.log(`  ${largeFile}`);
      }
      //console.log(lfsFile)
      let lfsFileNames = lfsFile.join(`\n`)
      let bodyTemplateSingle = `## :warning: Possible large file detected :warning: \n
      The following file exceeds the file size limit of ${fsl} bytes:
      ${lfsFileNames.toString()}
      Please reduce the size of the file or remove it from the pull request and upload to BCM instead.`
      let bodyTemplateMulti = `## :warning: Possible large files detected :warning: \n
      The following files exceed the file size limit of ${fsl} bytes:
      ${lfsFileNames.toString()}
      Please reduce the size of the files or remove them from the pull request and upload to BCM instead.`
      let bodyTemplate = bodyTemplateMulti;
      if (lfsFile.length === 1) {
        bodyTemplate = bodyTemplateSingle;
      }

      /*
      await client.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: bodyTemplate
      })
      */
      core.setOutput("lfsFiles", lfsFile)
      isError = true;
      core.error(`Large File detected! Reduce the file size or upload to BCM.`)
      labels.indexOf(labelLargeFile) === -1 ? labels.push(labelLargeFile) : core.debug(`${labelLargeFile} already exists in labels array`);
    } else {
      console.log("No large files detected...")
    }
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

async function getLargeFileLabel(client: github.GitHub, owner: string, repo: string)
{
    // Get large file Warning Label
    let lfslabelObj = {}
    try {
      lfslabelObj = await client.issues.getLabel({
        owner,
        repo,
        name: labelLargeFile
      })
    } catch (error) {
      if (error.message === "Not Found") {
        await client.issues.createLabel({
          owner,
          repo,
          name: labelLargeFile,
          color: "ff1493",
          description: "Warning Label for use when a large file is detected in the commits of a Pull Request"
        })
        console.log(`No large file warning label detected. Creating new label ...`)
        console.log(`Large file warning label created`)
      } else {
        console.log(`getLabel error: ${error.message}`)
      }
    }

    return lfslabelObj;
}

async function getInvalidFileLabel(client: github.GitHub, owner: string, repo: string)
{
  // Get invalid file name Warning Label
  let ifLabelObj = {}
  try {
    ifLabelObj = await client.issues.getLabel({
      owner,
      repo,
      name: labelFileName
    })
  } catch (error) {
    if (error.message === "Not Found") {
      await client.issues.createLabel({
        owner,
        repo,
        name: labelFileName,
        color: "ff1493",
        description: "Warning Label for use when an invalid file name is detected in the commits of a Pull Request"
      })
      console.log(`No invalid file name warning label detected. Creating new label ...`)
      console.log(`Invalid file name warning label created`)
    } else {
      console.log(`getLabel error: ${error.message}`)
    }
  }

  return ifLabelObj;
}

async function getNewRootItemLabel(client: github.GitHub, owner: string, repo: string)
{
    // Get new root item Warning Label
    let nrLabelObj = {}
    try {
      nrLabelObj = await client.issues.getLabel({
        owner,
        repo,
        name: labelRootDir
      })
    } catch (error) {
      if (error.message === "Not Found") {
        await client.issues.createLabel({
          owner,
          repo,
          name: labelRootDir,
          color: "ff1493",
          description: "Warning Label for use when a new root item is detected in the commits of a Pull Request"
        })
        console.log(`No new root item warning label detected. Creating new label ...`)
        console.log(`New root item warning label created`)
      } else {
        console.log(`getLabel error: ${error.message}`)
      }
    }

    return nrLabelObj;
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
