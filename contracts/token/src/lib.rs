//! SlowCook launch token: a standard NEP-141 / NEP-145 / NEP-148 fungible token.
//!
//! One instance is deployed per launch, on a sub-account of the SlowCook factory.
//! Differences from the reference FT:
//! - Supply starts at zero. Only `owner` (the factory) can `mint`, and it does so once, at finalize.
//!   So no token can exist, move or trade before the auction clears (invariant I4).
//! - Any holder can `burn` its own balance (the factory uses this for unsold supply and buybacks).
//! - When the owner transfers to an unregistered account, the account is registered and the
//!   storage is paid from this contract's balance (funded by the launch creation fee), so
//!   bidders and swappers never need a separate `storage_deposit` to receive tokens.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault,
    PromiseOrValue,
};

pub const DECIMALS: u8 = 18;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Accounts,
    Metadata,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Token {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    owner: AccountId,
}

#[near]
impl Token {
    #[init]
    pub fn new(owner_id: AccountId, name: String, symbol: String, icon: Option<String>) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        };
        metadata.assert_valid();
        let mut token = FungibleToken::new(StorageKey::Accounts);
        token.internal_register_account(&owner_id);
        Self {
            token,
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner: owner_id,
        }
    }

    /// Mint `amount` (base units) to `account_id`. Owner only.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner,
            "E_AUTH: only owner can mint"
        );
        self.ensure_registered(&account_id);
        self.token.internal_deposit(&account_id, amount.0);
        FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("slowcook finalize"),
        }
        .emit();
    }

    /// Burn `amount` (base units) from the caller's own balance. Requires 1 yoctoNEAR.
    #[payable]
    pub fn burn(&mut self, amount: U128) {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        self.token.internal_withdraw(&account_id, amount.0);
        FtBurn {
            owner_id: &account_id,
            amount,
            memo: None,
        }
        .emit();
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    fn ensure_registered(&mut self, account_id: &AccountId) {
        if !self.token.accounts.contains_key(account_id) {
            self.token.internal_register_account(account_id);
        }
    }
}

#[near]
impl FungibleTokenCore for Token {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        if env::predecessor_account_id() == self.owner {
            self.ensure_registered(&receiver_id);
        }
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Token {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            FtBurn {
                owner_id: &sender_id,
                amount: U128(burned),
                memo: None,
            }
            .emit();
        }
        used.into()
    }
}

#[near]
impl StorageManagement for Token {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            if balance > 0 {
                FtBurn {
                    owner_id: &account_id,
                    amount: U128(balance),
                    memo: None,
                }
                .emit();
            }
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Token {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().expect("metadata")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.current_account_id("pepe-0.factory.near".parse().unwrap())
            .predecessor_account_id(predecessor)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .account_balance(NearToken::from_near(5));
        testing_env!(b.build());
    }

    fn new_token() -> Token {
        ctx(accounts(0), 0);
        Token::new(accounts(0), "Pepe".into(), "PEPE".into(), None)
    }

    #[test]
    fn supply_starts_at_zero() {
        let t = new_token();
        assert_eq!(t.ft_total_supply().0, 0);
        assert_eq!(t.ft_metadata().decimals, 18);
    }

    #[test]
    #[should_panic(expected = "E_AUTH")]
    fn only_owner_can_mint() {
        let mut t = new_token();
        ctx(accounts(1), 0);
        t.mint(accounts(1), U128(5));
    }

    #[test]
    fn owner_mints_transfers_with_auto_registration_and_burns() {
        let mut t = new_token();
        t.mint(accounts(0), U128(1_000));
        ctx(accounts(0), 1);
        t.ft_transfer(accounts(2), U128(300), None);
        assert_eq!(t.ft_balance_of(accounts(2)).0, 300);
        t.burn(U128(200));
        assert_eq!(t.ft_balance_of(accounts(0)).0, 500);
        assert_eq!(t.ft_total_supply().0, 800);
    }

    #[test]
    #[should_panic(expected = "is not registered")]
    fn non_owner_transfer_to_unregistered_fails() {
        let mut t = new_token();
        t.mint(accounts(1), U128(1_000));
        ctx(accounts(1), 1);
        t.ft_transfer(accounts(3), U128(1), None);
    }
}
