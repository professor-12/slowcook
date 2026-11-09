//! Sandbox integration tests: real wasm, real NEAR runtime (near-sandbox), real cross-contract
//! calls between the SlowCook factory and per-launch NEP-141 tokens.
//!
//! Prerequisite: `pnpm build:contracts` (writes target/near/**.wasm).
//! Run: `cargo test -p slowcook-integration-tests -- --nocapture --test-threads 1`
//!
//! Timing uses the sandbox's real clock: commit/reveal windows are 10 s, poke interval 1 s.

use anyhow::Result;
use futures::future::join_all;
use near_workspaces::network::Sandbox;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;

const ONE_TOKEN: u128 = 1_000_000_000_000_000_000;
const P_MIN: u128 = 1_000_000_000_000_000_000; // 1e-6 NEAR per token

fn wasm(name: &str) -> Vec<u8> {
    let p = format!(
        "{}/../../target/near/{name}/{name}.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read(&p).unwrap_or_else(|_| panic!("missing {p}: run `pnpm build:contracts` first"))
}

fn u(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

struct Env {
    worker: Worker<Sandbox>,
    root: Account,
    factory: Contract,
}

async fn setup() -> Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let acc = root
        .create_subaccount("factory")
        .initial_balance(NearToken::from_near(500))
        .transact()
        .await?
        .into_result()?;
    let factory = acc.deploy(&wasm("slowcook")).await?.into_result()?;
    factory
        .call("new")
        .args_json(json!({ "owner": factory.id() }))
        .transact()
        .await?
        .into_result()?;
    factory
        .as_account()
        .call(factory.id(), "set_token_code")
        .args(wasm("slowcook_token"))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(Env {
        worker,
        root,
        factory,
    })
}

async fn user(env: &Env, name: &str, near: u128) -> Result<Account> {
    Ok(env
        .root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(near))
        .transact()
        .await?
        .into_result()?)
}

fn args(total: u128, commit: u32, reveal: u32) -> Value {
    json!({
        "name": "Slow Pepe", "symbol": "SPEPE", "icon": null,
        "total_supply": total.to_string(), "sale_bps": 6000, "lp_bps": 3000, "creator_bps": 1000,
        "p_min": P_MIN.to_string(), "commit_secs": commit, "reveal_secs": reveal,
        "k_obs": 2, "h_obs": 3, "r_bps": 1000, "epoch_secs": 10, "poke_interval_secs": 1,
    })
}

async fn create(
    env: &Env,
    creator: &Account,
    a: Value,
    deposit_near: u128,
) -> Result<(u64, String)> {
    let r = creator
        .call(env.factory.id(), "create_launch")
        .args_json(json!({ "args": a }))
        .deposit(NearToken::from_near(deposit_near))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "create_launch failed: {:?}", r.failures());
    let id: u64 = r.json::<String>()?.parse()?;
    let l = launch(env, id).await?;
    assert_eq!(
        l["status"], "Open",
        "token deploy callback should open the launch"
    );
    Ok((id, l["token_id"].as_str().unwrap().to_string()))
}

async fn launch(env: &Env, id: u64) -> Result<Value> {
    Ok(env
        .factory
        .view("get_launch")
        .args_json(json!({ "id": id.to_string() }))
        .await?
        .json()?)
}

fn salt(name: &str) -> String {
    hex::encode(Sha256::digest(format!("salt-{name}").as_bytes()))
}

fn commit_hash(id: u64, bidder: &str, tick: u8, qty: u128) -> String {
    hex::encode(Sha256::digest(
        format!("{id}:{bidder}:{tick}:{qty}:{}", salt(bidder)).as_bytes(),
    ))
}

async fn commit(
    env: &Env,
    a: &Account,
    id: u64,
    tick: u8,
    qty: u128,
    deposit_yocto: u128,
) -> Result<()> {
    let r = a
        .call(env.factory.id(), "commit")
        .args_json(json!({ "launch_id": id.to_string(), "hash_hex": commit_hash(id, a.id().as_str(), tick, qty) }))
        .deposit(NearToken::from_yoctonear(deposit_yocto + NearToken::from_millinear(5).as_yoctonear()))
        .transact()
        .await?;
    assert!(r.is_success(), "commit failed: {:?}", r.failures());
    Ok(())
}

async fn reveal(env: &Env, a: &Account, id: u64, tick: u8, qty: u128) -> Result<bool> {
    let r = a
        .call(env.factory.id(), "reveal")
        .args_json(json!({ "launch_id": id.to_string(), "tick": tick, "qty": qty.to_string(), "salt_hex": salt(a.id().as_str()) }))
        .transact()
        .await?;
    Ok(r.is_success())
}

async fn wait_until(env: &Env, id: u64, field: &str) -> Result<()> {
    let target = u(&launch(env, id).await?[field]) as u64;
    loop {
        let now = env.worker.view_block().await?.timestamp() / 1_000_000;
        if now >= target {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

async fn finalize(env: &Env, id: u64) -> Result<u64> {
    let r = env
        .root
        .call(env.factory.id(), "finalize")
        .args_json(json!({ "launch_id": id.to_string() }))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "finalize failed: {:?}", r.failures());
    Ok(r.total_gas_burnt.as_gas())
}

async fn claim(env: &Env, a: &Account, id: u64) -> Result<Value> {
    let r = a
        .call(env.factory.id(), "claim")
        .args_json(json!({ "launch_id": id.to_string() }))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "claim failed: {:?}", r.failures());
    Ok(r.json()?)
}

async fn ft_balance(env: &Env, token: &str, who: &str) -> Result<u128> {
    let v: Value = env
        .worker
        .view(&token.parse()?, "ft_balance_of")
        .args_json(json!({ "account_id": who }))
        .await?
        .json()?;
    Ok(u(&v))
}

async fn ft_supply(env: &Env, token: &str) -> Result<u128> {
    let v: Value = env
        .worker
        .view(&token.parse()?, "ft_total_supply")
        .await?
        .json()?;
    Ok(u(&v))
}

async fn solvency(env: &Env) -> Result<Value> {
    Ok(env.factory.view("get_solvency").await?.json()?)
}

fn err_contains(r: &near_workspaces::result::ExecutionFinalResult, code: &str) -> bool {
    format!("{:?}", r.failures()).contains(code)
}

/// Full launch with 30 bidders, oversubscribed: one price, pro-rata at the margin, I1–I3 on-chain.
#[tokio::test]
async fn full_launch_30_bidders() -> Result<()> {
    let env = setup().await?;
    let creator = user(&env, "creator", 20).await?;
    let (id, token) = create(&env, &creator, args(1_000_000, 40, 30), 3).await?;
    assert_eq!(
        ft_supply(&env, &token).await?,
        0,
        "I4: no supply before finalize"
    );

    let mut bidders = vec![];
    for i in 0..30 {
        bidders.push(user(&env, &format!("b{i}"), 30).await?);
    }
    let plan: Vec<(u8, u128)> = (0..30)
        .map(|i| ((i % 12) as u8 + 6, 30_000 + (i as u128 % 5) * 5_000))
        .collect();
    let prices: Vec<Value> = env
        .factory
        .view("get_tick_prices")
        .args_json(json!({ "id": id.to_string() }))
        .await?
        .json()?;
    // 20% over-deposit hides the real bid.
    let deposits: Vec<u128> = plan
        .iter()
        .map(|(t, q)| u(&prices[*t as usize]) * q * 12 / 10)
        .collect();
    let commits = bidders
        .iter()
        .zip(&plan)
        .zip(&deposits)
        .map(|((b, (t, q)), d)| commit(&env, b, id, *t, *q, *d));
    for r in join_all(commits).await {
        r?;
    }
    // Committed bids are opaque: the contract stores only the hash.
    let v: Value = env
        .factory
        .view("get_bid")
        .args_json(json!({ "launch_id": id.to_string(), "account_id": bidders[0].id() }))
        .await?
        .json()?;
    assert!(v["tick"].is_null() && v["qty"].is_null());

    wait_until(&env, id, "commit_end_ms").await?;
    let reveals = bidders
        .iter()
        .zip(&plan)
        .map(|(b, (t, q))| reveal(&env, b, id, *t, *q));
    for r in join_all(reveals).await {
        assert!(r?);
    }
    wait_until(&env, id, "reveal_end_ms").await?;
    let gas = finalize(&env, id).await?;
    let l = launch(&env, id).await?;
    assert_eq!(l["status"], "Finalized");
    let clearing = u(&l["clearing_price"]);
    let filled = u(&l["filled"]);
    let (lp, cr, burned) = (
        u(&l["lp_tokens"]),
        u(&l["creator_tokens"]),
        u(&l["burned_at_finalize"]),
    );
    // I1 on-chain: token total supply = filled + lp + creator; burned = total - that.
    assert_eq!(
        ft_supply(&env, &token).await?,
        (filled + lp + cr) * ONE_TOKEN
    );
    assert_eq!(filled + lp + cr + burned, 1_000_000);
    println!("finalize gas burnt: {:.2} Tgas", gas as f64 / 1e12);

    let mut paid_total = 0u128;
    for (i, b) in bidders.iter().enumerate() {
        let s = claim(&env, b, id).await?;
        let (f, paid, refund, pen) = (
            u(&s["filled"]),
            u(&s["paid"]),
            u(&s["refund"]),
            u(&s["penalty"]),
        );
        assert_eq!(paid, clearing * f, "uniform price");
        assert_eq!(paid + refund + pen, deposits[i], "I2");
        assert_eq!(
            ft_balance(&env, &token, b.id().as_str()).await?,
            f * ONE_TOKEN
        );
        paid_total += paid;
    }
    assert_eq!(paid_total, u(&l["proceeds"]));
    let s = solvency(&env).await?;
    assert_eq!(s["solvent"], true, "I3: {s}");
    println!("solvency after 30-bidder launch: {s}");
    Ok(())
}

/// Undersubscribed: clearing at p_min, unsold sale supply never minted (burned), shares scaled.
#[tokio::test]
async fn undersubscribed_burn_path() -> Result<()> {
    let env = setup().await?;
    let creator = user(&env, "creator", 20).await?;
    let (id, token) = create(&env, &creator, args(1_000_000, 10, 10), 3).await?;
    let a = user(&env, "alice", 20).await?;
    let b = user(&env, "bob", 20).await?;
    commit(&env, &a, id, 20, 50_000, 10 * 10u128.pow(24)).await?;
    commit(&env, &b, id, 3, 30_000, 10u128.pow(24)).await?;
    wait_until(&env, id, "commit_end_ms").await?;
    assert!(reveal(&env, &a, id, 20, 50_000).await?);
    assert!(reveal(&env, &b, id, 3, 30_000).await?);
    wait_until(&env, id, "reveal_end_ms").await?;
    finalize(&env, id).await?;
    let l = launch(&env, id).await?;
    assert_eq!(
        u(&l["clearing_price"]),
        P_MIN,
        "undersubscribed clears at p_min"
    );
    assert_eq!(u(&l["filled"]), 80_000);
    assert_eq!(u(&l["lp_tokens"]), 40_000);
    assert_eq!(u(&l["creator_tokens"]), 13_333);
    assert_eq!(
        u(&l["burned_at_finalize"]),
        1_000_000 - 80_000 - 40_000 - 13_333
    );
    assert_eq!(
        ft_supply(&env, &token).await?,
        (80_000 + 40_000 + 13_333) * ONE_TOKEN
    );
    // The high bidder pays p_min too.
    let s = claim(&env, &a, id).await?;
    assert_eq!(u(&s["paid"]), P_MIN * 50_000);
    Ok(())
}

/// Scripted dump: defend() blocked before trigger, fires once, then blocked by the epoch cap.
/// Creator unlock is blocked while price is below clearing and allowed after it holds.
#[tokio::test]
async fn dump_defend_epoch_cap_and_creator_unlock() -> Result<()> {
    let env = setup().await?;
    let creator = user(&env, "creator", 20).await?;
    let mut a = args(1_000_000, 10, 10);
    a["epoch_secs"] = json!(60);
    let (id, token) = create(&env, &creator, a, 3).await?;
    let whale = user(&env, "whale", 50).await?;
    let fish = user(&env, "fish", 50).await?;
    commit(&env, &whale, id, 10, 400_000, 5 * 10u128.pow(24)).await?;
    commit(&env, &fish, id, 10, 200_000, 3 * 10u128.pow(24)).await?;
    wait_until(&env, id, "commit_end_ms").await?;
    reveal(&env, &whale, id, 10, 400_000).await?;
    reveal(&env, &fish, id, 10, 200_000).await?;
    wait_until(&env, id, "reveal_end_ms").await?;
    finalize(&env, id).await?;
    claim(&env, &whale, id).await?;
    claim(&env, &fish, id).await?;

    let poke = || async {
        env.root
            .call(env.factory.id(), "poke")
            .args_json(json!({ "launch_id": id.to_string() }))
            .max_gas()
            .transact()
            .await
    };
    let defend = || async {
        env.root
            .call(env.factory.id(), "defend")
            .args_json(json!({ "launch_id": id.to_string() }))
            .max_gas()
            .transact()
            .await
    };

    // Creator locked at the start.
    let r = creator
        .call(env.factory.id(), "unlock_creator")
        .args_json(json!({ "launch_id": id.to_string() }))
        .max_gas()
        .transact()
        .await?;
    assert!(err_contains(&r, "E_LOCKED"));
    // defend() without trigger.
    assert!(err_contains(&defend().await?, "E_TRIGGER"));
    tokio::time::sleep(Duration::from_millis(1_300)).await;
    assert!(poke().await?.is_success());

    // Close the at-clearing observation interval, then the whale dumps 300k tokens through ft_transfer_call -> ft_on_transfer.
    let r = whale
        .call(&token.parse()?, "ft_transfer_call")
        .args_json(json!({ "receiver_id": env.factory.id(), "amount": (300_000 * ONE_TOKEN).to_string(), "msg": json!({"launch_id": id.to_string()}).to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "dump failed: {:?}", r.failures());
    let t0: Value = env
        .factory
        .view("get_treasury")
        .args_json(json!({ "launch_id": id.to_string() }))
        .await?
        .json()?;
    assert!(u(&t0["spot_price"]) < u(&t0["floor_price"]));

    for _ in 0..2 {
        tokio::time::sleep(Duration::from_millis(1_300)).await;
        assert!(poke().await?.is_success());
    }
    let supply_before = ft_supply(&env, &token).await?;
    let r = defend().await?;
    assert!(r.is_success(), "defend failed: {:?}", r.failures());
    let t1: Value = env
        .factory
        .view("get_treasury")
        .args_json(json!({ "launch_id": id.to_string() }))
        .await?
        .json()?;
    let spent = u(&t1["treasury"]["total_spent"]);
    let t0_balance = u(&t0["treasury"]["near_balance"]);
    assert!(
        spent > 0 && spent <= t0_balance / 10,
        "I5: spent {spent} of {t0_balance}"
    );
    let bought = u(&t1["treasury"]["total_bought_back"]);
    assert_eq!(
        ft_supply(&env, &token).await?,
        supply_before - bought,
        "bought tokens burned"
    );
    println!("defend: spent {spent} yocto, burned {bought} base units");

    // Same epoch: after k fresh observations the cap blocks it.
    for _ in 0..2 {
        tokio::time::sleep(Duration::from_millis(1_300)).await;
        assert!(poke().await?.is_success());
    }
    let r = defend().await?;
    assert!(err_contains(&r, "E_EPOCH_CAP"), "{:?}", r.failures());

    // Price recovers (a buyer), holds at/above clearing for h_obs pokes -> creator unlock.
    let buyer = user(&env, "buyer", 100).await?;
    let r = buyer
        .call(env.factory.id(), "swap_near_for_token")
        .args_json(json!({ "launch_id": id.to_string(), "min_out": "0" }))
        .deposit(NearToken::from_near(10))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success());
    for _ in 0..4 {
        tokio::time::sleep(Duration::from_millis(1_300)).await;
        poke().await?.into_result()?;
    }
    let r = creator
        .call(env.factory.id(), "unlock_creator")
        .args_json(json!({ "launch_id": id.to_string() }))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "unlock failed: {:?}", r.failures());
    let l = launch(&env, id).await?;
    assert_eq!(
        ft_balance(&env, &token, creator.id().as_str()).await?,
        u(&l["creator_tokens"]) * ONE_TOKEN
    );
    assert_eq!(solvency(&env).await?["solvent"], true);
    Ok(())
}

/// Measures what a launch costs with the token code embedded (deployed per launch) versus as a
/// NEAR global contract (deployed once, referenced by hash).
#[tokio::test]
async fn measure_token_deploy_costs() -> Result<()> {
    let env = setup().await?;
    let creator = user(&env, "creator", 100).await?;
    let bal = |a: Account| async move { a.view_account().await.unwrap().balance.as_yoctonear() };
    let before = bal(creator.clone()).await;
    let (_, token) = create(&env, &creator, args(1_000_000, 60, 60), 3).await?;
    let embedded_cost = before - bal(creator.clone()).await;
    let token_acc = env.worker.view_account(&token.parse()?).await?;
    println!(
        "embedded: creator paid {:.4} NEAR, token account storage {} bytes, balance {:.4} NEAR",
        embedded_cost as f64 / 1e24,
        token_acc.storage_usage,
        token_acc.balance.as_yoctonear() as f64 / 1e24
    );

    let fbefore = env.factory.view_account().await?.balance.as_yoctonear();
    let r = env
        .factory
        .as_account()
        .call(env.factory.id(), "publish_token_code_globally")
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "publish global failed: {:?}", r.failures());
    let fafter = env.factory.view_account().await?.balance.as_yoctonear();
    let mode: Value = env.factory.view("get_token_code").await?.json()?;
    assert!(mode.get("Global").is_some(), "{mode}");
    println!(
        "global publish cost (one-off): {:.4} NEAR",
        (fbefore - fafter) as f64 / 1e24
    );

    let before = bal(creator.clone()).await;
    let (_, token2) = create(&env, &creator, args(1_000_000, 60, 60), 1).await?;
    let global_cost = before - bal(creator.clone()).await;
    let token_acc = env.worker.view_account(&token2.parse()?).await?;
    println!(
        "global: creator paid {:.4} NEAR, token account storage {} bytes",
        global_cost as f64 / 1e24,
        token_acc.storage_usage
    );
    assert!(global_cost < embedded_cost);
    Ok(())
}
