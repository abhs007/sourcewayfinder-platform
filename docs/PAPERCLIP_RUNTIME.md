# Local Paperclip operation

The local controller runs at **http://localhost:3100** in authenticated, private mode. The owner account is `abhishek51891@gmail.com`; its generated password is in `private/runtime/owner-credentials.json`, mode 600. Keep that file private. The first administrator was claimed through the supported signup and `/api/bootstrap/claim` APIs, not a database edit.

## Installation and reproducibility

The dedicated Colima profile is `sourcewayfinder`: four virtual CPUs, 12 GB memory, a 60 GB data disk, no Mac directory mounts and no forwarded SSH agent. It does not change macOS sleep settings. Docker named volumes live inside this VM. The controller alone publishes a port, bound to `127.0.0.1:3100`.

Installed tools: Colima 0.10.3, Docker 29.10.0, Compose 5.8.0 and Buildx 0.39.1. Runtime definitions live in `infra/paperclip/compose.yaml`.

From the repository root:

```sh
python3 ops/paperclip-runtime.py prepare
python3 ops/paperclip-runtime.py vm-start
python3 ops/paperclip-runtime.py build
python3 ops/paperclip-runtime.py up
python3 ops/paperclip-runtime.py status
```

`prepare` generates private credentials once and checks out Paperclip commit `7671e0cf0d718351f3b0c4d6a7d33df9867ffb8a`. It generates a Dockerfile with the observed Node base-image digest, Codex **0.169.1**, and the callback-security overlay described below. The other upstream CLI providers are omitted. PostgreSQL is pinned to 17.9-alpine and its image digest. Build input hashes and actual image identities are recorded in `private/runtime/build-inputs.json` and `image-manifest.json`; private build logs are retained.

The source commit alone does not make upstream builds bit-for-bit reproducible: its Dockerfile resolves OS packages and refreshes part of its pnpm resolution. Preserve and promote the qualified image identities. A fresh build must be qualified again. Do not silently move the source or model versions.

The adapter test rejected Codex 0.169.0 because these models require at least 0.169.1 with ChatGPT authentication. That check determined the corrected CLI pin.

## Isolation and the necessary upstream adjustment

The controller, private PostgreSQL database, SSH agent executor and egress gateway are separate containers. No container mounts the immigration workspace, personal home, browser profiles, production credentials or host Docker socket. The agent process uses an unprivileged account, a read-only container root and writable named volumes for its home and task workspaces.

The agent network is internal. The controller and database are not on it. The gateway permits HTTPS CONNECT only to approved OpenAI/ChatGPT, GitHub and package-registry domains, checks all resolved addresses and connects to the checked address. It rejects private-network destinations. Agent access to Paperclip goes through a task-only HTTP route allowlist; configuration, hiring, permission, approval and wake endpoints are denied. The gateway also relays controller SSH connections to the executor. SSH forwarding is disabled, and the agent host key is independently pinned.

Three pinned-source details required explicit handling:

1. Paperclip's `low_trust_review` execution requires its `sandbox` driver and refuses SSH. The roles therefore use standard trust with `canCreateAgents`, `canCreateSkills` and `canAssignTasks` false; the external network gateway supplies the stricter API boundary.
2. The SSH adapter creates a callback relay that normally forwards to controller loopback. That would bypass an external gateway. The generated build adds one argument to the Codex relay call: `hostApiUrl: process.env.PAPERCLIP_AGENT_CALLBACK_UPSTREAM`. The operator sets that variable to `http://egress:8081`. This is a deliberate, hashed overlay on the pinned source, not an unmodified upstream image. It must remain covered by a real callback-denial test whenever Paperclip is upgraded.
3. The server pre-dispatch credential gate originally exempted cloud sandboxes but still demanded controller credentials for SSH guest login. `ssh-guest-auth.patch` threads the selected environment's explicit `useHostAuth` setting into that gate and exempts only `driver === "ssh" && useHostAuth === true`. The actual remote adapter still checks guest authentication. Local execution and other SSH modes retain the missing-credential rejection.

The gateway is enforced infrastructure, outside agent-editable task workspaces. Giving agents a controller login, Docker socket or gateway configuration access would defeat this boundary.

The installed CLI's default bubblewrap sandbox initially failed under Docker's default namespace/mount restrictions. The supported legacy Landlock flag also refused filesystem-restricted execution because app-server socket isolation requires bubblewrap. No sandbox bypass was used.

Automatic approval review rejected the first broad AppArmor proposal, and it was not applied. The owner then explicitly approved the reviewed VM-only namespace, mount and pivot operations. The applied AppArmor profile is derived from Docker's default and preserves its `/proc`, `/sys`, network-family and peer signal/ptrace denials; the exception replaces its blanket mount denial with mount/pivot-root allowances. The matching seccomp profile permits the necessary namespace operations; one initially omitted `pivot_root` syscall was added under that explicit authorization. The final hashes are recorded in `security-profile-provenance.json`, with both diffs retained. The actual sandbox test succeeded inside the workspace and denied a write to the otherwise writable agent home outside it.

The controller still grants no outer `CAP_SYS_ADMIN`, the container root stays read-only, and no Mac directories or Docker socket are mounted. The startup command verifies the exact approved profile hashes before loading them into the dedicated VM. This deliberately expands the container's namespace/mount syscall surface; a policy change requires review and renewed isolation tests.

## Bootstrap and authentication

The idempotent API bootstrap creates SourceWayfinder, `platform-delivery`, `guidance-maintenance`, the isolated environment, seven roles and eight milestone tasks with dependencies. Role instructions are versioned in `infra/paperclip/roles`; models and reasoning levels are in `agents.json`.

```sh
PAPERCLIP_OWNER_COOKIE_FILE=private/runtime/owner-cookie.txt \
  node ops/paperclip-bootstrap.mjs
```

The cookie file contains the signed-in owner's Cookie header, never an agent credential. All created or reconciled agents are paused. Existing roles are reconciled through supported configuration and permission endpoints; future hiring approvals remain required. The seven initial roles were explicitly authorized in the implementation plan. Source, expectation, merge and release approvals belong to the platform's separate human review workflow and are not generated here.

Use **a fresh ChatGPT login inside the SSH guest**, never the Mac's auth file and never an OpenAI API key:

```sh
docker --context colima-sourcewayfinder exec -it --user agent \
  -e HTTP_PROXY=http://egress:8080 -e HTTPS_PROXY=http://egress:8080 \
  sourcewayfinder-agent-1 codex login --device-auth
```

Follow the displayed OpenAI URL and one-time code. `useHostAuth: true` means the **remote SSH guest's own Codex home** in this pinned adapter. Its source explicitly skips controller-home upload in this mode. The guest home survives container restart through a named volume. A lost VM requires reauthentication unless credentials are restored through a separately authorized recovery process.

Then run:

```sh
PAPERCLIP_OWNER_COOKIE_FILE=private/runtime/owner-cookie.txt \
  node ops/paperclip-bootstrap.mjs --test-environments
```

This calls the pinned adapter-test endpoint inside the actual SSH environment. It may perform a small model probe. Inspect private `adapter-*.json` results. Model identifiers are not assumed available merely because they are configured. Only after actual authentication, model and sandbox checks should the dispatch bridge admit a fictional smoke task.

Bootstrap deduplicates model probes by model and reasoning level: Sol medium, Sol high and Astra high. It still checks the saved configuration of all seven roles. Repeat model probes only after a material runtime, authentication or model change.

## Daily operation and usage

Timer heartbeats are disabled, interval zero, ordinary demand/assignment wakes disabled, and each agent has a one-run cap. The trusted bridge must also enforce **one run across the whole company**; per-agent caps alone are insufficient. Under that global lease, temporarily enable `wakeOnDemand` and resume only the chosen role, invoke its exact task, then disable demand admission immediately. Pause the role after the run reaches a terminal state; pausing can stop work. A manual owner invocation still respects `wakeOnDemand: false` in this pinned version. Keep other roles paused. There is no autonomous hiring, recursive delegation or paid API fallback.

Use compact issue packets, one implementation attempt and at most two repair attempts, then escalate. Runs have a 30-minute timeout and 30-second grace. Quota failure must persist a checkpoint and pause the queue. Do not use Paperclip's subscription dollar display as a Pro capacity meter.

The completed fictional task reported 16,584 input, 63,872 cached-input and 490 output tokens across its run. Cached history accumulates across tool turns; this is not evidence that the initial task packet alone contained 80,000 tokens. The built-in orchestration instructions and skill lookup contribute overhead even for a small task. The initial log also exposed unnecessary attempts to connect to auto-configured project and connection MCP servers on guest loopback. Bootstrap now explicitly disables those two MCP entries, and a CLI configuration check verified them disabled without another model run. Keep the required task-governance instructions, use bounded task packets, resume only related work, and measure actual run usage. No token-reduction percentage has been established.

Docker logs rotate at five files of 10 MB per service. They include JSON controller events and bounded gateway diagnostics without message payloads. Build, qualification and recovery reports remain under `private/runtime`. PostgreSQL is reachable only by the controller network.

After waking the Mac, start the profile and call `up`; the named-volume database and job records survive. Reconcile missed maintenance once. `python3 ops/paperclip-runtime.py stop` stops containers without deleting volumes. **Do not use `down -v` or delete the Colima profile during ordinary maintenance.**

The user LaunchAgent `org.sourcewayfinder.local-runtime` is installed and active. It runs `ops/paperclip-login-start.py` at login, starts the dedicated VM and Compose services, then checks Docker availability once a minute. Launchd retries failures with a 60-second throttle. These are infrastructure checks, not model heartbeats. Logs rotate in `private/runtime/login-runtime.log`. To intentionally keep the VM stopped, unload this LaunchAgent first; otherwise it will recover the VM. No macOS sleep setting is changed.

Observed proof is recorded in `private/runtime/qualification-report.json`, `callback-qualification.log`, `adapter-*.json` and the backup restore reports. The actual SSH callback relay returned 403 for both configuration and approval attempts. Controller restart preserved the company and all seven paused agents. Guest ChatGPT authentication survived container restart. The real SSH Codex task `SOU-9` completed successfully and produced the independently verified fictional JSON artifact; no paid API fallback was used. Workspace writes succeeded and an outside-workspace write was denied by the actual sandbox.

Real provider quota exhaustion, token refresh and expired-login recovery have not been induced. These remain distinct from the demonstrated restart behavior. The controller's named volume holds the source replica, and the SSH adapter copies isolated per-run workspaces into the guest. No Mac directory is mounted for this purpose.

## Synchronizing reviewed source

Commit the reviewed candidate, keep all seven roles paused with demand wakes disabled, and run:

```sh
python3 ops/paperclip-sync-source.py --commit "$(git rev-parse HEAD)"
```

The command requires an exact commit and a clean tracked working tree. It reads only committed blobs, rejects private paths, symlinks, submodules, oversized files and known credential patterns, and transfers a Git archive through Docker's copy API. Pattern checks supplement human secret review; they cannot establish that arbitrary text contains no sensitive information.

Each revision gets a new controller-volume directory under `/paperclip/workspaces/sourcewayfinder-revisions/<commit>`. The tool reconstructs the exact original commit and tree as a single shallow Git revision, with no earlier history or configured remote. It verifies every imported file hash, Git cleanliness and the absence of host mounts, then changes both project source paths through the supported API and checks the saved values. A rerun verifies the same replica without overwriting it. Modified replicas fail closed; prior task worktrees and the fictional smoke baseline are retained.

The tool refuses active runs or unpaused roles, shares the qualification lock, and never wakes an agent. Do not run dispatch or manually resume a role during synchronization. Project updates are restored on a failed reconciliation, and a partial replica remains available for diagnosis rather than being overwritten. Bootstrap preserves a valid selected revision path. Private proof is recorded in `private/runtime/source-sync-report.json`; subsequent source changes require a new reviewed commit and another sync.

Backups and the recovery drill are documented in `BACKUP_RECOVERY.md`. Never restore application guidance as active merely because local orchestration has recovered.
