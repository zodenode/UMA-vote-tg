import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";
import { mainnet, polygon } from "wagmi/chains";
import { magicLink } from "./magicLinkConnector";
import { rpcHttpUrl } from "./rpcHttpUrl";

const mainnetRpc = rpcHttpUrl(import.meta.env.VITE_MAINNET_RPC_URL as string | undefined);
const polygonRpc = rpcHttpUrl(import.meta.env.VITE_POLYGON_RPC_URL as string | undefined);
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
const magicPublishableKey = (import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY as string | undefined)?.trim();

/**
 * Connector order: popular Polymarket paths first (MetaMask, Coinbase), optional Magic email/social,
 * WalletConnect (mobile + many apps), then generic injected (Phantom / Rabby / Brave when they inject `ethereum`).
 */
const connectors = [
  metaMask(),
  coinbaseWallet({ appName: "uma.vote" }),
  ...(magicPublishableKey ? [magicLink({ apiKey: magicPublishableKey, chain: mainnet })] : []),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "uma.vote",
            description: "Polygon disputes · DVM voting · petitions (Ethereum signing).",
            url: typeof window !== "undefined" ? window.location.origin : "https://localhost",
            icons: [],
          },
        }),
      ]
    : []),
  /** Phantom, Rabby, Brave, etc. (EIP-1193 `window.ethereum` — use after MetaMask / Coinbase so explicit picks win.) */
  injected({ shimDisconnect: true }),
];

/** Mainnet first = safer default for DVM + petition SIWE; Swap tab switches to Polygon explicitly. */
export const wagmiConfig = createConfig({
  chains: [mainnet, polygon],
  connectors,
  transports: {
    [mainnet.id]: http(mainnetRpc || undefined),
    [polygon.id]: http(polygonRpc || undefined),
  },
});
