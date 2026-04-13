import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const mainnetRpc = import.meta.env.VITE_MAINNET_RPC_URL as string | undefined;
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
            description: "Swap UMA and vote on DVM requests (Ethereum mainnet).",
            url: typeof window !== "undefined" ? window.location.origin : "https://localhost",
            icons: [],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors,
  transports: {
    [mainnet.id]: http(mainnetRpc || undefined),
  },
});
