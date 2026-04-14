import { createConfig, http } from "wagmi";
import { mainnet, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { rpcHttpUrl } from "./rpcHttpUrl";

const mainnetRpc = rpcHttpUrl(import.meta.env.VITE_MAINNET_RPC_URL as string | undefined);
const polygonRpc = rpcHttpUrl(import.meta.env.VITE_POLYGON_RPC_URL as string | undefined);
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "UMA Vote",
            description: "Polygon-first disputes · DVM voting on Ethereum (VotingV2).",
            url: typeof window !== "undefined" ? window.location.origin : "https://localhost",
            icons: [],
          },
        }),
      ]
    : []),
];

/** Mainnet first = safer default for DVM pages; Swap tab connects/switches to Polygon explicitly. */
export const wagmiConfig = createConfig({
  chains: [mainnet, polygon],
  connectors,
  transports: {
    [mainnet.id]: http(mainnetRpc || undefined),
    [polygon.id]: http(polygonRpc || undefined),
  },
});
