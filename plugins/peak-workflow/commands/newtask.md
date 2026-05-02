Follow the workflow below to gather the context of the current conversation and generate/replace the ./tmp/NEW_TASK_HANDOFF.md file for use in a new Claude code session.

## Step 1 - Gather the following content of the current conversation prescribed by the following:

The context to preload the new task with. If applicable based on the current task, this should include:

1. Current Work: Describe in detail what was being worked on prior to this request to create a new task. Pay special attention to the more recent messages / conversation.

2. Key Technical Concepts: List all important technical concepts, technologies, coding conventions, and frameworks discussed, which might be relevant for the new task.

3. Relevant Files and Code: If applicable, enumerate specific files and code sections examined, modified, or created for the task continuation. Pay special attention to the most recent messages and changes.

4. Problem Solving: Document problems solved thus far and any ongoing troubleshooting efforts.

5. Pending Tasks and Next Steps: Outline all pending tasks that you have explicitly been asked to work on, as well as list the next steps you will take for all outstanding work, if applicable. Include code snippets where they add clarity. For any next steps, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no information loss in context between tasks. It's important to be detailed here.

6. Git State: Run `git status` and `git log -2 --oneline` and capture: current branch name, any uncommitted or staged files, and the last 2 commit hashes + messages. This tells the new session exactly where the working tree stands.

7. Blockers and Deferred Decisions: List anything that was explicitly blocked (a failing check, a missing piece of information, a tool limitation) and any decisions that were posed to the user but not yet answered. The new session needs to know what it's waiting on.

## Step 2 - Write the file

Write all gathered content to `./tmp/NEW_TASK_HANDOFF.md`, creating the `./tmp/` directory if it doesn't exist. Overwrite the file if it already exists.

After writing, output this message to the user:

> Handoff written to `./tmp/NEW_TASK_HANDOFF.md`. In your new session, start with:
> **"Please read ./tmp/NEW_TASK_HANDOFF.md and continue the work."**