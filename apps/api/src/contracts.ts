/** UMA mainnet (chain 1) — packages/core/networks/1.json */
export const MAINNET = {
  chainId: 1,
  optimisticOracleV2: "0xA0Ae6609447e57a42c51B50EAe921D701823FFAe" as const,
  votingV2: "0x004395edb43EFca9885CEdad51EC9fAf93Bd34ac" as const,
};

/** UMA Polygon (chain 137) — packages/core/networks/137.json */
export const POLYGON = {
  chainId: 137,
  optimisticOracleV2: "0xee3afe347d5c74317041e2618c49534daf887c24" as const,
};

export const votingV2Abi = [
  {
    inputs: [],
    name: "getVotePhase",
    outputs: [{ internalType: "enum VotingAncillaryInterface.Phase", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentRoundId",
    outputs: [{ internalType: "uint32", name: "", type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roundId", type: "uint256" }],
    name: "getRoundEndTime",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "voteTiming",
    outputs: [{ internalType: "uint256", name: "phaseLength", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const ooV2Abi = [
  {
    inputs: [
      { internalType: "address", name: "requester", type: "address" },
      { internalType: "bytes32", name: "identifier", type: "bytes32" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
      { internalType: "bytes", name: "ancillaryData", type: "bytes" },
    ],
    name: "getRequest",
    outputs: [
      {
        components: [
          { internalType: "address", name: "proposer", type: "address" },
          { internalType: "address", name: "disputer", type: "address" },
          { internalType: "contract IERC20", name: "currency", type: "address" },
          { internalType: "bool", name: "settled", type: "bool" },
          {
            components: [
              { internalType: "bool", name: "eventBased", type: "bool" },
              { internalType: "bool", name: "refundOnDispute", type: "bool" },
              { internalType: "bool", name: "callbackOnPriceProposed", type: "bool" },
              { internalType: "bool", name: "callbackOnPriceDisputed", type: "bool" },
              { internalType: "bool", name: "callbackOnPriceSettled", type: "bool" },
              { internalType: "uint256", name: "bond", type: "uint256" },
              { internalType: "uint256", name: "customLiveness", type: "uint256" },
            ],
            internalType: "struct OptimisticOracleV2Interface.RequestSettings",
            name: "requestSettings",
            type: "tuple",
          },
          { internalType: "int256", name: "proposedPrice", type: "int256" },
          { internalType: "int256", name: "resolvedPrice", type: "int256" },
          { internalType: "uint256", name: "expirationTime", type: "uint256" },
          { internalType: "uint256", name: "reward", type: "uint256" },
          { internalType: "uint256", name: "finalFee", type: "uint256" },
        ],
        internalType: "struct OptimisticOracleV2Interface.Request",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
