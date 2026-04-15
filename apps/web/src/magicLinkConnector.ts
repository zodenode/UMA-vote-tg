import { ChainNotConfiguredError, createConnector } from "@wagmi/core";
import { Magic } from "magic-sdk";
import {
  type Address,
  type EIP1193Provider,
  getAddress,
  numberToHex,
  UserRejectedRequestError,
} from "viem";
import type { Chain } from "viem/chains";

type MagicInstance = InstanceType<typeof Magic>;

/**
 * Email / SMS / social login via Magic — same publishable key as your Magic dashboard.
 * Network is fixed to the given `chain` (use Ethereum mainnet for uma.vote petition SIWE).
 */
export function magicLink(parameters: { apiKey: string; chain: Chain }) {
  let magic: MagicInstance | undefined;
  let accountsChanged: ((accounts: string[]) => void) | undefined;
  let chainChanged: ((chainId: string) => void) | undefined;

  const getMagic = (): MagicInstance => {
    if (!magic) {
      const rpcUrl = parameters.chain.rpcUrls.default.http[0];
      if (!rpcUrl) throw new Error("magicLink: chain missing default RPC URL");
      magic = new Magic(parameters.apiKey, {
        network: {
          chainId: parameters.chain.id,
          rpcUrl,
        },
      });
    }
    return magic;
  };

  return createConnector<EIP1193Provider>((config) => ({
    id: "magicLink",
    name: "Magic Link",
    type: "magicLink",

    async getProvider() {
      return getMagic().rpcProvider as unknown as EIP1193Provider;
    },

    async connect({ chainId } = {}) {
      const m = getMagic();
      let addresses: string[];
      try {
        addresses = await m.wallet.connectWithUI();
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (/closed|denied|reject/i.test(err.message)) throw new UserRejectedRequestError(err);
        throw err;
      }
      if (!addresses?.length) throw new UserRejectedRequestError(new Error("No accounts from Magic"));

      const provider = (await this.getProvider()) as EIP1193Provider & {
        on?: (ev: string, fn: (...args: unknown[]) => void) => void;
        removeListener?: (ev: string, fn: (...args: unknown[]) => void) => void;
      };

      if (provider.on && !accountsChanged) {
        accountsChanged = (acs: string[]) => {
          config.emitter.emit("change", { accounts: acs.map((x) => getAddress(x as Address)) });
        };
        provider.on("accountsChanged", accountsChanged);
      }
      if (provider.on && !chainChanged) {
        chainChanged = (hex: string) => {
          const id = normalizeChainId(hex);
          if (id != null) config.emitter.emit("change", { chainId: id });
        };
        provider.on("chainChanged", chainChanged);
      }

      const targetChainId = chainId ?? parameters.chain.id;
      let currentChainId = await this.getChainId();
      if (targetChainId !== currentChainId) {
        const switched = await this.switchChain?.({ chainId: targetChainId }).catch(() => null);
        currentChainId = switched?.id ?? (await this.getChainId());
      }

      // Wagmi's connect() return type is conditional on `withCapabilities`; Magic never uses capabilities.
      return {
        accounts: addresses.map((x) => getAddress(x as Address)),
        chainId: currentChainId,
      } as never;
    },

    async disconnect() {
      const m = magic;
      const provider = (m?.rpcProvider ?? null) as
        | (EIP1193Provider & {
            removeListener?: (ev: string, fn: (...args: unknown[]) => void) => void;
          })
        | null;
      if (provider?.removeListener) {
        if (accountsChanged) provider.removeListener("accountsChanged", accountsChanged);
        if (chainChanged) provider.removeListener("chainChanged", chainChanged);
      }
      accountsChanged = undefined;
      chainChanged = undefined;
      if (m) await m.user.logout();
      magic = undefined;
    },

    async getAccounts() {
      if (!magic) return [];
      const loggedIn = await magic.user.isLoggedIn().catch(() => false);
      if (!loggedIn) return [];
      const provider = (await this.getProvider()) as EIP1193Provider;
      const raw = (await provider.request({ method: "eth_accounts" })) as string[];
      return raw.map((x) => getAddress(x as Address));
    },

    async getChainId() {
      const provider = (await this.getProvider()) as EIP1193Provider;
      const hex = (await provider.request({ method: "eth_chainId" })) as string;
      return Number(hex);
    },

    async isAuthorized() {
      try {
        return await getMagic()
          .user.isLoggedIn()
          .catch(() => false);
      } catch {
        return false;
      }
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((c) => c.id === chainId);
      if (!chain) throw new ChainNotConfiguredError();
      const provider = (await this.getProvider()) as EIP1193Provider;
      const idHex = numberToHex(chainId);
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: idHex }],
        });
        return chain;
      } catch {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: idHex,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [...chain.rpcUrls.default.http],
              blockExplorerUrls: chain.blockExplorers?.default?.url
                ? [chain.blockExplorers.default.url]
                : undefined,
            },
          ],
        });
        return chain;
      }
    },

    onAccountsChanged(accounts) {
      config.emitter.emit("change", {
        accounts: accounts.length ? accounts.map((x) => getAddress(x as Address)) : undefined,
      });
    },

    onChainChanged(chain) {
      const id = normalizeChainId(chain);
      if (id) config.emitter.emit("change", { chainId: id });
    },

    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}

magicLink.type = "magicLink" as const;

function normalizeChainId(chainId: string | number): number | undefined {
  if (typeof chainId === "number" && Number.isFinite(chainId)) return chainId;
  const s = String(chainId).trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return Number.parseInt(s, 16);
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
