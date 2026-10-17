import { useEffect, useState } from "react";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable, Hash } from "genlayer-js/types";
import logo from "../logo.png";
import {
  gen,
  execution,
  nextAction,
  normalizeTx,
  parseSafeGEN,
  phases,
  validAddress,
  type Covenant,
} from "./protocol";
declare global {
  interface Window {
    ethereum?: {
      request: (x: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}
const reader = createClient({ chain: studionet });
const explorer = "https://explorer-studio.genlayer.com";
const deployedAddress = import.meta.env.VITE_CONTRACT_ADDRESS || "0xd689a42Ffffe5CD3A07f4bd0e938c7F221Dac024";
const short = (x: string) =>
  x ? `${x.slice(0, 6)}…${x.slice(-4)}` : "Not connected";
export default function App() {
  const [address, setAddress] = useState(
    localStorage.getItem("mergeproof-address") || deployedAddress,
  );
  const [wallet, setWallet] = useState("");
  const [id, setId] = useState(0);
  const [c, setC] = useState<Covenant>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    "Connect a StudioNet wallet or inspect a deployed covenant.",
  );
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"dossier" | "create" | "evidence">("dossier");
  const [pr, setPr] = useState("1");
  const [repo, setRepo] = useState("owner/repository");
  const [contributor, setContributor] = useState("");
  const [title, setTitle] = useState("Merge verified implementation milestone");
  const [criteria, setCriteria] = useState(
    "Production implementation satisfies the accepted issue.\nRegression tests cover the corrected behavior.",
  );
  const [budget, setBudget] = useState("0.001");
  const [parentHash, setParentHash] = useState("");
  const [childHash, setChildHash] = useState("");
  const [recipient, setRecipient] = useState("");
  const connect = async () => {
    if (!window.ethereum) throw Error("Install a compatible wallet extension.");
    const a = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    setWallet(a[0]?.toLowerCase() || "");
    setNotice("Wallet connected. Sync authoritative contract state.");
  };
  const sync = async (selectedId = id) => {
    if (!validAddress(address))
      throw Error("Enter a deployed StudioNet contract address.");
    const cfg = await reader.readContract({
      address: address as `0x${string}`,
      functionName: "get_config",
      args: [],
    });
    if ((cfg as any).schema !== "mergeproof-covenant-v2")
      throw Error("Address is not MergeProof Covenant.");
    const v = await reader.readContract({
      address: address as `0x${string}`,
      functionName: "get_covenant",
      args: [selectedId],
    });
    setC(v as Covenant);
    localStorage.setItem("mergeproof-address", address);
    setNotice("Authoritative covenant state loaded.");
  };
  const write = async (
    method: string,
    args: CalldataEncodable[],
    value?: bigint,
  ) => {
    if (!window.ethereum || !wallet || !validAddress(address))
      throw Error("Connect wallet and sync a deployed contract first.");
    setBusy(true);
    setError("");
    try {
      const client = createClient({
        chain: studionet,
        account: wallet as `0x${string}`,
        provider: window.ethereum,
      });
      const raw = await client.writeContract({
        address: address as `0x${string}`,
        functionName: method,
        args,
        value: value ?? 0n,
      });
      const hash = normalizeTx(raw) as Hash;
      setNotice(`Submitted ${method}. Waiting for acceptance… ${hash}`);
      await reader.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        retries: 80,
        interval: 3000,
      });
      setNotice(`Accepted ${method}. Waiting for finalization… ${hash}`);
      await reader.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        retries: 80,
        interval: 3000,
      });
      const tx = await reader.getTransaction({ hash });
      const result = execution(tx);
      const selectedId = method === "create_covenant" ? Number(result) : id;
      if (!Number.isInteger(selectedId) || selectedId < 0) throw Error("Invalid covenant ID returned by contract.");
      if (method === "create_covenant") setId(selectedId);
      await sync(selectedId);
      setNotice(
        `${method} finalized and authoritative state was re-read. ${hash}`,
      );
      return { hash, result, tx };
    } finally {
      setBusy(false);
    }
  };
  const safe = (fn: () => Promise<unknown>) =>
    fn().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  const create = async () => {
    const now = Math.floor(Date.now() / 1000),
      wei = parseSafeGEN(budget);
    const terms = {
      title,
      contributor: contributor.toLowerCase(),
      repo,
      base_branch: "main",
      production_prefix: "src/",
      test_prefix: "tests/",
      criteria: criteria
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      budget: wei,
      partial_bps: 5000,
      proof_deadline: now + 1800,
      challenge_end: now + 3600,
      expires: now + 5400,
    };
    await write("create_covenant", [JSON.stringify(terms)]);
  };
  useEffect(() => {
    if (validAddress(address)) safe(sync);
  }, []);
  const phase = c?.phase || "NO COVENANT";
  const now = Math.floor(Date.now() / 1000);
  return (
    <>
      <header>
        <div className="brand">
          <img src={logo} />
          <div>
            <b>MERGEPROOF</b>
            <span>COVENANT</span>
          </div>
        </div>
        <nav>
          <button
            onClick={() => setTab("dossier")}
            className={tab === "dossier" ? "active" : ""}
          >
            Dossier
          </button>
          <button
            onClick={() => setTab("create")}
            className={tab === "create" ? "active" : ""}
          >
            New covenant
          </button>
          <button
            onClick={() => setTab("evidence")}
            className={tab === "evidence" ? "active" : ""}
          >
            Evidence rules
          </button>
        </nav>
        <button className="connect" onClick={() => safe(connect)}>
          {wallet ? short(wallet) : "Connect wallet"}
        </button>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">SOURCE-BOUND SOFTWARE ESCROW</p>
            <h1>
              Merge it.
              <br />
              <em>Prove it.</em> Get paid.
            </h1>
            <p>
              Escrow follows the implementation—not a screenshot, a README
              claim, or an unmerged branch.
            </p>
          </div>
          <img src={logo} />
        </section>
        <section className="contract">
          <label>
            ACTIVE CONTRACT
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… deployed StudioNet address"
            />
          </label>
          <label>
            COVENANT ID
            <input
              type="number"
              min="0"
              value={id}
              onChange={(e) => setId(Number(e.target.value))}
            />
          </label>
          <button onClick={() => safe(sync)}>Sync state</button>
          {validAddress(address) && (
            <a href={`${explorer}/address/${address}`} target="_blank">
              Explorer ↗
            </a>
          )}
        </section>
        {error && <div className="alert error">{error}</div>}
        <div className="alert">{notice}</div>
        {tab === "dossier" && (
          <section className="workspace">
            <aside className="rail">
              <p>STATE MACHINE</p>
              {phases.map((p, i) => (
                <div
                  className={`${phase === p ? "current" : ""} ${c && phases.indexOf(phase) > i ? "done" : ""}`}
                  key={p}
                >
                  <i>{i + 1}</i>
                  <span>{p.replaceAll("_", " ")}</span>
                </div>
              ))}
            </aside>
            <article className="dossier">
              <div className="dossier-head">
                <div>
                  <p className="eyebrow">MERGE DOSSIER #{id}</p>
                  <h2>{c?.terms.title || "No covenant loaded"}</h2>
                </div>
                <span className={`status ${phase.toLowerCase()}`}>{phase}</span>
              </div>
              {c ? (
                <>
                  <div className="facts">
                    <div>
                      <small>Repository</small>
                      <b>{c.terms.repo}</b>
                    </div>
                    <div>
                      <small>Contributor</small>
                      <b>{short(c.terms.contributor)}</b>
                    </div>
                    <div>
                      <small>Escrow</small>
                      <b>{gen(c.terms.budget)}</b>
                    </div>
                    <div>
                      <small>Next action</small>
                      <b>{nextAction(phase, wallet, c)}</b>
                    </div>
                  </div>
                  <div className="proof">
                    <h3>Authoritative merge proof</h3>
                    <div className="sha">
                      {c.verdict?.snapshot?.merge_sha ||
                        "Waiting for GitHub-controlled merge identity"}
                    </div>
                    <div className="file-columns">
                      <div>
                        <b>Production paths</b>
                        {c.verdict?.snapshot?.production?.map((x) => (
                          <code key={x}>+ {x}</code>
                        )) || <span>Not verified</span>}
                      </div>
                      <div>
                        <b>Regression paths</b>
                        {c.verdict?.snapshot?.tests?.map((x) => (
                          <code key={x}>+ {x}</code>
                        )) || <span>Not verified</span>}
                      </div>
                    </div>
                  </div>
                  <div className="actions">
                    <input
                      value={pr}
                      onChange={(e) => setPr(e.target.value)}
                      placeholder="PR number"
                    />
                    <button
                      disabled={
                        busy || phase !== "DRAFT" || wallet !== c.sponsor
                      }
                      onClick={() =>
                        safe(() => write("fund", [id], BigInt(c.terms.budget)))
                      }
                    >
                      Fund exact escrow
                    </button>
                    <button
                      disabled={
                        busy ||
                        phase !== "FUNDED" ||
                        wallet !== c.terms.contributor.toLowerCase()
                      }
                      onClick={() =>
                        safe(() => write("submit_merge", [id, Number(pr)]))
                      }
                    >
                      Submit merge
                    </button>
                    <button
                      disabled={busy || phase !== "PROOF_SUBMITTED"}
                      onClick={() => safe(() => write("verify_merge", [id]))}
                    >
                      Verify sources
                    </button>
                    <button
                      disabled={busy || phase !== "VERIFIED"}
                      onClick={() =>
                        safe(() => write("challenge", [id, "0".repeat(64)]))
                      }
                    >
                      Challenge
                    </button>
                    <button
                      disabled={busy || phase !== "CHALLENGED" || now >= c.terms.expires}
                      onClick={() => safe(() => write("resolve_challenge", [id]))}
                    >
                      Recheck challenged proof
                    </button>
                    <button
                      disabled={busy || phase !== "VERIFIED" || now < c.terms.challenge_end || now >= c.terms.expires}
                      onClick={() => safe(() => write("finalize", [id]))}
                    >
                      Finalize
                    </button>
                    <button
                      disabled={
                        busy ||
                        ![
                          "FUNDED",
                          "PROOF_SUBMITTED",
                          "VERIFIED",
                          "CHALLENGED",
                        ].includes(phase) || now < c.terms.expires
                      }
                      onClick={() => safe(() => write("recover_expired", [id]))}
                    >
                      Recover expired
                    </button>
                    <button
                      disabled={
                        busy ||
                        !c.credits[wallet]?.amount ||
                        c.credits[wallet]?.status !== "AVAILABLE"
                      }
                      onClick={() => safe(() => write("request_payout", [id]))}
                    >
                      Withdraw verified credit
                    </button>
                  </div>
                  <div className="proof settlement">
                    <h3>Confirm native settlement</h3>
                    <p>
                      A transfer stays pending until the contract verifies its
                      finalized parent and credited child receipts.
                    </p>
                    <div className="actions">
                      <input
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="Recipient 0x…"
                      />
                      <input
                        value={parentHash}
                        onChange={(e) => setParentHash(e.target.value)}
                        placeholder="Parent tx 0x…"
                      />
                      <input
                        value={childHash}
                        onChange={(e) => setChildHash(e.target.value)}
                        placeholder="Child tx 0x…"
                      />
                      <button
                        disabled={
                          busy || !recipient || !parentHash || !childHash
                        }
                        onClick={() =>
                          safe(() =>
                            write("confirm_payout", [
                              id,
                              recipient,
                              parentHash,
                              childHash,
                            ]),
                          )
                        }
                      >
                        Verify receipt
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty">
                  Paste a deployed contract, select an ID, and sync.
                </div>
              )}
            </article>
          </section>
        )}
        {tab === "create" && (
          <section className="form">
            <p className="eyebrow">NEW IMMUTABLE COVENANT</p>
            <h2>Seal the acceptance boundary.</h2>
            <div className="grid">
              <label>
                Milestone title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Contributor wallet
                <input
                  value={contributor}
                  onChange={(e) => setContributor(e.target.value)}
                  placeholder="0x…"
                />
              </label>
              <label>
                GitHub repository
                <input value={repo} onChange={(e) => setRepo(e.target.value)} />
              </label>
              <label>
                Escrow · GEN
                <input
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </label>
            </div>
            <label>
              Acceptance criteria · one per line
              <textarea
                rows={5}
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !wallet || !validAddress(contributor)}
              onClick={() => safe(create)}
            >
              Lock covenant terms →
            </button>
            <p className="fine">
              Creation deposits nothing. The creating wallet becomes sponsor;
              the deployer receives no role.
            </p>
          </section>
        )}
        {tab === "evidence" && (
          <section className="rules">
            <p className="eyebrow">PROOF BEFORE PROSE</p>
            <h2>What the covenant accepts.</h2>
            <div className="rule-grid">
              <article>
                <b>01 · GitHub identity</b>
                <p>
                  Exact repository, PR number, base branch and merge SHA come
                  from GitHub-controlled API responses.
                </p>
              </article>
              <article>
                <b>02 · Actual implementation</b>
                <p>
                  A Markdown report alone cannot satisfy a milestone. Required
                  production paths must change.
                </p>
              </article>
              <article>
                <b>03 · Regression evidence</b>
                <p>
                  Tests must exist in the exact merge revision, not an unrelated
                  branch or stale commit.
                </p>
              </article>
              <article>
                <b>04 · Bounded judgment</b>
                <p>
                  Validators choose SATISFIED, PARTIAL or INSUFFICIENT. Contract
                  code calculates money.
                </p>
              </article>
            </div>
            <div className="scope">
              <b>Explicit boundary</b>
              <p>
                A verified merge does not prove that code was deployed, is
                vulnerability-free, or behaves correctly in every runtime
                environment.
              </p>
            </div>
          </section>
        )}
      </main>
      <footer>
        <span>StudioNet · GenLayer intelligent contract</span>
        <span>Deployer has no operator privilege</span>
      </footer>
    </>
  );
}
