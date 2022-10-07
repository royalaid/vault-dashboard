import { MetaTransactionData } from "@gnosis.pm/safe-core-sdk-types";
import DeleteIcon from "@mui/icons-material/Delete";
import * as MUI from "@mui/material";
import { Button } from "@mui/material";
import {
  ChainId,
  COLLATERAL,
  COLLATERAL_V2,
  COLLATERALS,
  Erc20Stablecoin,
} from "@qidao/sdk";
import { ethers } from "ethers";
import { Contract } from "ethers-multicall";
import React, { Dispatch, useEffect, useState } from "react";
import {
  Datagrid,
  ListContextProvider,
  TextField,
  TextFieldProps,
  useList,
  useListContext,
  useRecordContext,
  useUnselect,
} from "react-admin";
import { useProvider } from "../Connectors/Metamask";
import { ChainName } from "../constants";
import { init, multicall } from "../multicall";
import { getId } from "../utils/utils";

// const safeAddress = "0x3182E6856c3B59C39114416075770Ec9DC9Ff436"; //ETH Address
// const transactionServiceUrl = "https://safe-transaction.gnosis.io/"; // on rinkeby testnet
// const chainId = 1;
// const safeAddress = "0xBdeEf118d161ac657AF5Abc2a26487DD894868c7"; //ETH Address
// const transactionServiceUrl = "https://safe-transaction.polygon.gnosis.io/"; // on rinkeby testnet
// const chainId = 137;

// const setupSafe = async (metamaskProvider: Web3Provider) => {
//   const ethAdapter = new EthersAdapter({
//     ethers,
//     signer: metamaskProvider.getSigner(),
//   });
//
//   console.log({ chainId: await ethAdapter.getChainId() });
//   const safeService = new SafeServiceClient({
//     ethAdapter,
//     txServiceUrl: transactionServiceUrl,
//   });
//   const safeSdk = await Safe.create({
//     ethAdapter,
//     safeAddress,
//     contractNetworks: {
//       "137": {
//         multiSendAddress: "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761",
//         multiSendCallOnlyAddress: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
//         safeMasterCopyAddress: "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552",
//         safeProxyFactoryAddress: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
//       },
//     },
//   });
//   return { safeService, safeSdk };
// };

const saveTemplateAsFile = (filename: string, dataObjToWrite: Object) => {
  const blob = new Blob([JSON.stringify(dataObjToWrite)], {
    type: "text/json",
  });
  const link = document.createElement("a");

  link.download = filename;
  link.href = window.URL.createObjectURL(blob);
  link.dataset.downloadurl = ["text/json", link.download, link.href].join(":");

  const evt = new MouseEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
  });

  link.dispatchEvent(evt);
  link.remove();
};

const EditiableRow = (
  props: TextFieldProps & {
    vaults: TreasuryManagementVaultData[];
    setVaults: Dispatch<React.SetStateAction<TreasuryManagementVaultData[]>>;
    source: string;
  }
) => {
  const [editMode, setEditMode] = useState(false);
  const foo: TreasuryManagementVaultData = useRecordContext(props);
  const [collateralValue, setCollateralValue] = useState(
    foo.depositedCollateralAmount
  );
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newInt = parseFloat(event.target.value);
    const updatedVault = {
      ...foo,
      depositedCollateralAmount: newInt ? newInt : 0,
    };
    const updatedVaults = props.vaults.map((v) =>
      v.id !== updatedVault.id ? v : updatedVault
    );
    console.log({ updatedVaults });
    props.setVaults(updatedVaults);
    setCollateralValue(newInt ? newInt : 0);
  };
  return (
    <>
      {editMode ? (
        <MUI.TextField
          value={collateralValue}
          size="small"
          onChange={handleChange}
          onBlur={() => setEditMode(!editMode)}
        />
      ) : (
        <TextField
          onClick={() => setEditMode(!editMode)}
          source={props.source}
        />
      )}
    </>
  );
};

const ChainSelector: React.FC<{
  selectedChainId: ChainId;
  setSelectedChainId: Function;
}> = ({ selectedChainId, setSelectedChainId }) => {
  return (
    <MUI.FormControl>
      <MUI.InputLabel id="demo-simple-select-label">Chain</MUI.InputLabel>
      <MUI.Select
        labelId="demo-simple-select-label"
        id="demo-simple-select"
        value={selectedChainId}
        label="Age"
        onChange={(e) => {
          let cId: ChainId;
          if (typeof e.target.value === "string")
            cId = parseInt(e.target.value) as ChainId;
          else cId = e.target.value as ChainId;
          setSelectedChainId(cId);
        }}
      >
        {Object.keys(COLLATERALS)
          .map((cId) => {
            return parseInt(cId) as ChainId;
          })
          .filter((chainId) => !isNaN(chainId))
          .map((chainId) => {
            return (
              <MUI.MenuItem key={chainId} value={chainId}>
                {ChainName[chainId]}
              </MUI.MenuItem>
            );
          })}
      </MUI.Select>
    </MUI.FormControl>
  );
};

const PostBulkActionButtons = (props: {
  vaults: TreasuryManagementVaultData[];
  setVaults: Dispatch<React.SetStateAction<TreasuryManagementVaultData[]>>;
}) => {
  const { selectedIds, resource } = useListContext();
  const unselect = useUnselect(resource);

  console.log({ selectedIds });
  const deleteVaults = () => {
    const trimmedVaults = props.vaults.filter((v) => {
      return !selectedIds.includes(v.id);
    });
    props.setVaults(trimmedVaults);
    unselect(selectedIds);
  };

  return (
    <React.Fragment>
      <Button onClick={() => deleteVaults()}>
        <DeleteIcon />
        Delete
      </Button>
    </React.Fragment>
  );
};

type TreasuryManagementVaultData = (COLLATERAL | COLLATERAL_V2) & {
  depositedCollateralAmount: number;
  id: string | number;
  vaultIdx: number;
};

const fetchVaultZeroes = async (
  chainId: ChainId,
  collaterals: (COLLATERAL | COLLATERAL_V2)[]
) => {
  await init();
  const VAULT_IDX = 0;
  //TODO make the ordering link between collaterals and calls more explict
  const depositedCollateralCalls = collaterals.map((c) => {
    const vaultContract = new Contract(c.vaultAddress, c.contractAbi);
    return vaultContract.vaultCollateral(VAULT_IDX);
  });

  const depositedCollaterals = await multicall(
    chainId,
    depositedCollateralCalls
  );
  return collaterals.map((c, i) => {
    const depositedCollateralAmount =
      (depositedCollaterals[i] as unknown as number) / 10 ** c.token.decimals;
    return {
      ...c,
      depositedCollateralAmount,
      id: getId(c, VAULT_IDX),
      vaultIdx: VAULT_IDX,
    };
  });
};

const TreasuryAdmin = () => {
  const [selectedChainId, setSelectedChainId] = useState(ChainId.MATIC);

  // const [safeSdk, setSafeSdk] = useState<Safe>();
  // const [safeService, setSafeService] = useState<SafeServiceClient>();
  let metamaskProvider = useProvider();
  const [vaults, setVaults] = useState<TreasuryManagementVaultData[]>([]);
  useEffect(() => {
    const fetchAllChainsVaultZeros = async () => {
      const vaultZeros = await Promise.all(
        Object.keys(COLLATERALS).map((cId) => {
          const chainId = parseInt(cId) as ChainId;
          return fetchVaultZeroes(chainId, COLLATERALS[chainId] || []);
        })
      );
      setVaults(vaultZeros.flat());
    };
    void fetchAllChainsVaultZeros();
  }, []);

  type TxForTxBuilder = { description: string; raw: MetaTransactionData };

  const a = async () => {
    const vaultWithdrawTxs:
      | Promise<(TxForTxBuilder | undefined) | undefined>[]
      | undefined = vaults
      ?.filter((v) => v.chainId === selectedChainId)
      ?.map(async (vault) => {
        if (vault && metamaskProvider) {
          const vaultContract = vault.connect(
            vault.vaultAddress,
            metamaskProvider
          );

          try {
            // const collateralAmount = await vaultContract.vaultCollateral(
            //   vault.vaultIdx
            // );
            const foo = await (
              vaultContract as Erc20Stablecoin
            ).populateTransaction.withdrawCollateral(
              vault.vaultIdx,
              ethers.utils.parseUnits(
                vault.depositedCollateralAmount.toString(),
                vault.token.decimals
              )
            );
            // const foo = vaultContract.populateTransaction.withdrawCollateral( );

            return {
              description: `${vault.token.name} withdrawl from ${
                ChainName[vault.chainId]
              }`,
              raw: {
                to: vault.vaultAddress,
                value: "0",
                data: foo.data || "",
              },
            };
          } catch (e) {
            console.warn({ e });
            return;
          }
        } else return;
      });

    if (vaultWithdrawTxs) {
      const vaultTxs = (await Promise.all(vaultWithdrawTxs)).filter(
        (item): item is TxForTxBuilder => !!item
      );
      // const safeTx = await safeSdk.createTransaction({
      //   safeTransactionData: vaultTxs,
      // });
      console.log({ vaultTxs });
      // console.log({ safeTx });
      saveTemplateAsFile(`${selectedChainId}-withdraw-txes.json`, vaultTxs);
      // const safeTxHash = await safeSdk.getTransactionHash(safeTx);
      // const signature = await safeSdk.signTransactionHash(safeTxHash);
      // await safeService?.proposeTransaction({
      //   safeAddress: safeAddress,
      //   senderAddress: address || "",
      //   safeTransactionData: safeTx.data,
      //   senderSignature: signature.data,
      //   safeTxHash: safeTxHash,
      // });
    }
  };
  // }, [address, metamaskProvider, safeSdk, safeService, vaults]);
  const listContext = useList({
    data: vaults?.filter((v) => v.chainId === selectedChainId) || [],
  });
  return (
    <div>
      <>
        <button onClick={() => a()}>Click me to sign</button>
        <ChainSelector
          selectedChainId={selectedChainId}
          setSelectedChainId={setSelectedChainId}
        />
        <ListContextProvider value={listContext}>
          <Datagrid
            bulkActionButtons={
              <PostBulkActionButtons
                vaults={vaults || []}
                setVaults={setVaults}
              />
            }
          >
            <TextField source="vaultIdx" />
            <TextField source="id" />
            <EditiableRow
              source="depositedCollateralAmount"
              vaults={vaults || []}
              setVaults={setVaults}
            />
            <TextField source="token.name" />
          </Datagrid>
        </ListContextProvider>
      </>
    </div>
  );
};

export default TreasuryAdmin;
