// External Dependencies
const fs                  = require('fs');
//const { context, GitHub } = require('@actions/github');
const core                = require('@actions/core');
const ctx = require('@actions/github');

const commits = ctx.context.payload.commits;//.filter(c => c.distinct);
const repo    = ctx.context.payload.repository;
const org     = repo.organization;
const owner   = org || repo.owner;

try {

  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput(`who-to-greet`);
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  core.setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  //const payload = JSON.stringify(github.context.payload, undefined, 2)
  const payload = JSON.stringify(ctx.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}

const FILES          = [];
const FILES_MODIFIED = [];
const FILES_ADDED    = [];
const FILES_DELETED  = [];
const FILES_RENAMED  = [];

const gh   = new GitHub(core.getInput('token'));
const args = { owner: owner.name, repo: repo.name };

function isAdded(file) {
	return 'added' === file.status;
}

function isDeleted(file) {
	return 'deleted' === file.status;
}

function isModified(file) {
	return 'modified' === file.status;
}

function isRenamed(file) {
	return 'renamed' === file.status;
}

async function processCommit(commit) {
	args.ref = commit.id;
	result   = await gh.repos.getCommit(args);

	if (result && result.data) {
		const files = result.data.files;

		files.forEach( file => {
			isModified(file) && FILES.push(file.filename);
			isAdded(file) && FILES.push(file.filename);
			isRenamed(file) && FILES.push(file.filename);

			isModified(file) && FILES_MODIFIED.push(file.filename);
			isAdded(file) && FILES_ADDED.push(file.filename);
			isDeleted(file) && FILES_DELETED.push(file.filename);
			isRenamed(file) && FILES_RENAMED.push(file.filename);
		});
	}
}


Promise.all(commits.map(processCommit)).then(() => {
	process.stdout.write(`::debug::${JSON.stringify(FILES, 4)}`);
	process.stdout.write(`::set-output name=files-all::${JSON.stringify(FILES, 4)}`);
	process.stdout.write(`::set-output name=files-added::${JSON.stringify(FILES_ADDED, 4)}`);
	process.stdout.write(`::set-output name=files-deleted::${JSON.stringify(FILES_DELETED, 4)}`);
	process.stdout.write(`::set-output name=files-modified::${JSON.stringify(FILES_MODIFIED, 4)}`);
	process.stdout.write(`::set-output name=files-renamed::${JSON.stringify(FILES_RENAMED, 4)}`);

	fs.writeFileSync(`${process.env.HOME}/files.json`, JSON.stringify(FILES), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_modified.json`, JSON.stringify(FILES_MODIFIED), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_added.json`, JSON.stringify(FILES_ADDED), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_deleted.json`, JSON.stringify(FILES_DELETED), 'utf-8');
	fs.writeFileSync(`${process.env.HOME}/files_renamed.json`, JSON.stringify(FILES_RENAMED), 'utf-8');

	process.exit(0);
});