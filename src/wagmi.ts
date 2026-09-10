import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, polygon, arbitrum, base } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum, base],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
  },
  ssr: false,
});
