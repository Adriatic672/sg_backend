import * as StellarSdk from 'stellar-sdk';
import {
    Keypair,
    Networks,
    Asset,
    TransactionBuilder,
    Memo,
    Operation,
    Claimant,
    Server
} from 'stellar-sdk';

import dotenv from 'dotenv';
import BaseModel from './base.model';

dotenv.config();
export interface Balance {
    id: string;
    icon: string;
    name: string;
    symbol: string;
    issuer: string;
    balance: string;
}

 


export interface Recipient {
    publicKey: string;
    amount: string;
    asset_code: string;
    asset_issuer: string;
    senderSecretKey: string;
    creditPrivateKey: string
}
interface StellarConfig {
    startBalance: string;
    startBonusAmount: string;
    networkPassphrase: string;
    horizon: string;
    betToken: string;
    betTokenIssuer: string;
    airdropAccount: string;
    escrowAccount: string;
    escrowAccountPvKey: string;
    defaultFee: number;
}

interface TransactionResponse {
    hash: string;
    [key: string]: any;
}

export class Stellar extends BaseModel {
    private server: Server;
    public betToken: string = 'SBX';
    public betTokenIssuer: string = process.env.BET_TOKEN_ISSUER || '';
    public escrowAccount: string = process.env.ESCROW_ACCOUNT || '';
    private airdropKeypair: Keypair;
    private issuerPv: string;
    constructor() {
        super();
        this.server = new Server('https://horizon-testnet.stellar.org/');
        const airdropSecret = process.env.AIRDROP_SECRET;
        this.issuerPv = process.env.ISSUER_PV || '';
        if (!airdropSecret) {
            throw new Error('AIRDROP_SECRET environment variable is not set');
        }
        this.airdropKeypair = Keypair.fromSecret(airdropSecret);
    }

    async claimClaimableBalance(claimantSecret: string, sponserId: string): Promise<any[]> {
        const claimantKeypair = Keypair.fromSecret(claimantSecret);
        const senderAccount = await this.server.loadAccount(claimantKeypair.publicKey());
        const betAsset = new Asset(this.betToken, this.betTokenIssuer);

        const balance = await this.server.claimableBalances()
            .claimant(claimantKeypair.publicKey())
            .call();

        console.log(balance);
        return balance.records;
    }

    async createClaimableBalance(params: {
        senderKeyPair: Keypair;
        recipientPublicKey: string;
        amount: string;
        memo: string;
    }): Promise<string> {
        try {
            const { senderKeyPair, recipientPublicKey, amount, memo } = params;
            const sourceAccount = await this.server.loadAccount(senderKeyPair.publicKey());
            const betAsset = new Asset(this.betToken, this.betTokenIssuer);

            const claimants = [
                new Claimant(recipientPublicKey)  // Unconditional claim
            ];

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: '100',
                networkPassphrase: Networks.TESTNET
            })
                .addMemo(Memo.text(memo))
                .addOperation(Operation.createClaimableBalance({
                    asset: betAsset,
                    amount,
                    claimants
                }))
                .setTimeout(30)
                .build();

            transaction.sign(senderKeyPair);
            const result = await this.server.submitTransaction(transaction);
            return result.hash;
        } catch (error) {
            console.error('Create claimable balance failed:', error);
            return 'failed';
        }
    }

    async betMatchClaimableBalance(
        senderKeypair: Keypair,
        opponentKeypair: Keypair,
        amount: string,
        memo: string
    ): Promise<string> {
        const senderPublicKey = senderKeypair.publicKey();
        const opponentPublicKey = opponentKeypair.publicKey();

        const senderAccount = await this.server.loadAccount(senderPublicKey);
        const betAsset = new Asset(this.betToken, this.betTokenIssuer);

        const now = new Date();
        const soon = Math.floor(now.getTime() / 1000) + 60;

        // In version 7, we'll use unconditional claims for simplicity
        const senderClaimantsList = [
            new Claimant(opponentPublicKey),
            new Claimant(senderPublicKey)
        ];

        const opponentClaimantsList = [
            new Claimant(senderPublicKey),
            new Claimant(opponentPublicKey)
        ];

        const transaction = new TransactionBuilder(
            senderAccount,
            {
                networkPassphrase: Networks.TESTNET,
                fee: '100'
            }
        )
            .addMemo(Memo.text(memo))
            .addOperation(Operation.createClaimableBalance({
                asset: betAsset,
                amount: amount,
                claimants: senderClaimantsList
            }))
            .addOperation(Operation.createClaimableBalance({
                asset: betAsset,
                amount: amount,
                claimants: opponentClaimantsList,
                source: opponentPublicKey
            }))
            .setTimeout(30)
            .build();

        transaction.sign(senderKeypair);
        transaction.sign(opponentKeypair);
        const result = await this.server.submitTransaction(transaction);
        return result.hash;
    }
    async getBalance(publicKey: string,assetCode: string,assetIssuer: string) {
        try {
            const account = await this.server.loadAccount(publicKey);
            const betAsset = new Asset(assetCode, assetIssuer);
            
            // Find the balance for our specific asset
            const balance = account.balances.find(
                (b: any) => b.asset_code === betAsset.code && b.asset_issuer === betAsset.issuer
            );

            return balance ? balance.balance : '0'
            
        } catch (error) {

            console.error('Error getting balance:', error);
             return '0'
        }
    }

    async getBalances(publicKey: string) {

        const defaultTokens = ["XLM","SBX","UGX","USDT","KES","TZS"]
      
        const balances: Balance[] = [];
        try {
            const account:any = await this.server.loadAccount(publicKey);
            for (const balance of account.balances) {
                const asset_type = balance?.asset_type || '';
                const issuer = asset_type === 'native' ? '' : balance?.asset_issuer || '';
                const code = asset_type === 'native' ? 'XLM' : balance?.asset_code || '';

                balances.push({
                    id: balance.id,
                    icon: "💰",
                    name: code,
                    symbol: code,
                    issuer: issuer,
                    balance: balance.balance
                });
            }
            return balances
        } catch (error) {
            const defaultBalances = defaultTokens.map(token => ({
                id: token,
                icon: "💰",
                name: token,
                symbol: token,
                issuer: '',
                balance: '0'
            }));
            return defaultBalances;
           
        }
    }

    async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getChannelAccount() {
        await this.callQuerySafe("UPDATE `channel_accounts` SET `status` = 'free' WHERE `updated_at` < (NOW() - INTERVAL 1 MINUTE)");

        const maxWaitTime = 10000; // Maximum wait time of 10 seconds
        const checkInterval = 1000; // Check every 1 second
        const startTime = Date.now();

        let channelAccount: any = [];
        while (Date.now() - startTime < maxWaitTime) {
            channelAccount = await this.callQuerySafe("SELECT * FROM channel_accounts WHERE status='free' LIMIT 1");
            if (channelAccount.length > 0) {
                const keyPairPostion = Math.floor(Math.random() * channelAccount.length);
                const pvKey = channelAccount[keyPairPostion]['private_key'];
                this.updateChannelAccount(pvKey, "inUse");
                return pvKey;
            }
            await this.delay(checkInterval);
        }
        return "";
    }



    async updateChannelAccount(private_key: any, status: string) {
        try {
            const PostData = {
                status: status
            };
            return await this.updateData('channel_accounts', `private_key='${private_key}'`, PostData);
        } catch (e) {
            return "";
        }
    }

    addSignerIfNotExists(signers: Array<any>, keyPair: Keypair) {
        if (!signers.some(signer => signer.publicKey() === keyPair.publicKey())) {
            signers.push(keyPair);
        }
        return signers;
    }
    
    async makeBatchTransfers(memo: string, recipients: Recipient[]) {
        const sponsorKey = await this.getChannelAccount();
        try {

            console.log("RECEIVED==>", recipients)
            const SponsoringAccount = StellarSdk.Keypair.fromSecret(sponsorKey);
            console.log(`sponsorKey===>1`, sponsorKey)
            console.log(`sponsorKey===>2`, sponsorKey)

            /*
            const feeArray = JSON.parse(feeAccounts);
            const keyPairPosition = Math.floor(Math.random() * feeArray.length);
            const sponsorKey = feeArray[keyPairPosition];
*/
            const sourceAccountKeyPair = StellarSdk.Keypair.fromSecret(sponsorKey);



            let signers: Array<any> = [];
            let includeSigner = false;




            const fees = 1000000;

            const [
                {
                    max_fee: { mode: fee },
                },
                distributionAccount,
            ] = await Promise.all([
                this.server.feeStats(),
                this.server.loadAccount(sourceAccountKeyPair.publicKey()),
            ]);

            const transaction_builder = new StellarSdk.TransactionBuilder(distributionAccount, {
                fee: String(fees),
                networkPassphrase: Networks.TESTNET,
            });
            // this.saveLog(memo, "", "", "");
            let p = 0;
            console.log("STELLAR===>1")

            for (let recipient of recipients) {
                console.log(`OPERATION========>${p}`, recipient)
                let receiverPublicKey = recipient.publicKey;
                p++;


                const asset_code = recipient.asset_code;
                const asset_issuer = recipient.asset_issuer;
                const creditPrivateKey = recipient.creditPrivateKey;
                const senderSecretKey = recipient.senderSecretKey;

 
                const assetType = 'alpha';
                let amount = Number(recipient.amount).toFixed(7);
                amount = amount.toString();


                const senderKeyPair = StellarSdk.Keypair.fromSecret(senderSecretKey);


                signers = this.addSignerIfNotExists(signers, senderKeyPair);

                //signers.push(senderKeyPair);

                const asset = new StellarSdk.Asset(asset_code, asset_issuer);

                let exists = true;
                let hasTrustLine = true;

                try {
                    // await server.loadAccount(receiverPublicKey);
                    // if (assetType === "alpha") {
                    const assetCode = asset_code;
                    const assetIssuer = asset_issuer;

                    if (assetIssuer == receiverPublicKey) {
                        hasTrustLine = true;
                    } else {

                        const recPbKey = await this.server.loadAccount(receiverPublicKey);
                        hasTrustLine = recPbKey.balances.some((balance: any) => {
                            return balance.asset_code === assetCode && balance.asset_issuer === assetIssuer;
                        });
                    }
                    //}
                } catch (err) {
                    console.log("STELLAR===>3", err)
                    exists = false;
                    hasTrustLine = false;
                }
                console.log("exists===>", exists)
                console.log("hasTrustLine===>", hasTrustLine)

                if (!exists || !hasTrustLine) {
                    const creditPvKeyPair = StellarSdk.Keypair.fromSecret(creditPrivateKey);
                    signers = this.addSignerIfNotExists(signers, creditPvKeyPair);
                    signers = this.addSignerIfNotExists(signers, SponsoringAccount);

                    //1. create account, 2. change trust,3. allow trust, 4.payment

                    transaction_builder.addOperation(StellarSdk.Operation.beginSponsoringFutureReserves({
                        sponsoredId: receiverPublicKey,
                        source: SponsoringAccount.publicKey()
                    }));

                    if (!exists) {
                        transaction_builder.addOperation(StellarSdk.Operation.createAccount({
                            startingBalance: "0",
                            destination: receiverPublicKey,
                            source: SponsoringAccount.publicKey()
                        }));
                    }

                    if (!hasTrustLine) {
                        transaction_builder.addOperation(StellarSdk.Operation.changeTrust({
                            asset: asset,
                            source: receiverPublicKey,
                        }));
                        includeSigner = true;
                    
                    }

                    transaction_builder.addOperation(StellarSdk.Operation.endSponsoringFutureReserves({
                        source: receiverPublicKey,
                    }));
                }

                transaction_builder.addOperation(StellarSdk.Operation.payment({
                    destination: receiverPublicKey,
                    asset: asset,
                    amount: amount,
                    source: senderKeyPair.publicKey(),
                }));

               
            }

            transaction_builder.setTimeout(20);
            transaction_builder.addMemo(StellarSdk.Memo.text(memo));
            const transaction = transaction_builder.build();

            //signers.push(sourceAccountKeyPair);
            signers = this.addSignerIfNotExists(signers, sourceAccountKeyPair);

            console.log("==============START============")




            signers.forEach((signer: any) => {
                console.log("Signing with public key:", signer.publicKey());
                transaction.sign(signer);
            });



            console.log("==============END============")


            try {
                const transactionResult:any = await this.server.submitTransaction(transaction);
                console.log("StellarResponse===>", transactionResult)
                this.updateChannelAccount(sponsorKey, "free");

                if (transactionResult.successful) {
                    return this.MakeResponse(1, transactionResult.hash)
                } else {

                    return this.MakeResponse(101, "not processed")
                }
            } catch (e: any) {
                this.updateChannelAccount(sponsorKey, "free");

                if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
                    return this.MakeResponse(504, "Gateway Timeout or Network Issue");
                }

                console.log("Error during transaction submission");

                let errorDetail = e.response?.data?.extras?.result_codes;
                let errorMessage = "stellar transaction error";
                console.log("errorMessage", errorDetail)
                if (errorDetail) {
                    const operationError = errorDetail.operations;
                    const transactionError = errorDetail.transaction;

                    if (operationError === "tx_insufficient_balance") {
                        errorMessage = "Insufficient XLM balance to process transaction";
                    } else if (operationError === "payment_underfunded") {
                        errorMessage = "Insufficient Balance on your account";
                    } else {
                        errorMessage += `: ${transactionError || operationError || 'Unknown'}`;
                    }
                }


                if (errorMessage == "Unknown") {
                    return this.MakeResponse(203, errorMessage);
                } else {
                    console.log(errorMessage);
                    return this.MakeResponse(203, errorMessage);
                }
            }


        } catch (err) {

            console.log("txError", err)
            return this.MakeResponse(203, "transaction not set properly");
        }
    }
    async sponsorAccount(publicKey: string, receiverSecret: string, giveAirdrop=false): Promise<any> {
        try {
            console.log("Sponsoring asset", this.betToken);
            console.log("Sponsoring account", publicKey);
            
            // Validate inputs
            if (!publicKey || typeof publicKey !== 'string') {
                console.error("Invalid public key:", publicKey);
                throw new Error("Public key must be a string");
            }
            
            if (!receiverSecret || typeof receiverSecret !== 'string') {
                console.error("Invalid receiver secret key");
                throw new Error("Receiver secret key must be a string");
            }
            
            const senderKeypair = this.airdropKeypair;
            const betAsset = new Asset(this.betToken, this.betTokenIssuer);
            
            // Safely create receiver keypair
            let receiverKeypair;
            try {
                receiverKeypair = Keypair.fromSecret(receiverSecret);
            } catch (err) {
                console.error("Error creating keypair from secret:", err);
                throw new Error("Invalid secret key format");
            }

            // Load sender account
            let senderAccount;
            try {
                senderAccount = await this.server.loadAccount(senderKeypair.publicKey());
            } catch (err) {
                console.error("Error loading sender account:", err);
                throw new Error("Failed to load sender account");
            }

            // Build transaction
            const transaction = new TransactionBuilder(
                senderAccount,
                {
                    networkPassphrase: Networks.TESTNET,
                    fee: '100'
                }
            )
                .addMemo(Memo.text("Sponsored Account"))
                .addOperation(Operation.beginSponsoringFutureReserves({
                    sponsoredId: receiverKeypair.publicKey()
                }))
                .addOperation(Operation.createAccount({
                    startingBalance: "0",
                    destination: receiverKeypair.publicKey(),
                    source: senderKeypair.publicKey()
                }))
                .addOperation(Operation.changeTrust({
                    asset: betAsset,
                    source: receiverKeypair.publicKey()
                }))
                .addOperation(Operation.payment({
                    destination: receiverKeypair.publicKey(),
                    amount: giveAirdrop ? "1" : "1",
                    asset: betAsset,
                    source: senderKeypair.publicKey()
                }))
                .addOperation(Operation.endSponsoringFutureReserves({
                    source: receiverKeypair.publicKey()
                }))
                .setTimeout(180)
                .build();

            // Sign transaction
            try {
            transaction.sign(senderKeypair);
            transaction.sign(receiverKeypair);
            } catch (err) {
                console.error("Error signing transaction:", err);
                throw new Error("Failed to sign transaction");
            }

            // Submit transaction
            try {
            const result = await this.server.submitTransaction(transaction);
                console.log("Transaction successful:", result.hash);
                return this.MakeResponse(200, result.hash);
            } catch (e: any) {
                if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) {
                    return this.MakeResponse(504, "Gateway Timeout or Network Issue");
                }

                console.log("Error during transaction submission");
                let errorDetail = e.response?.data?.extras?.result_codes;
                let errorMessage = "stellar transaction error";

                console.log("errorDetail", errorDetail)
                
                if (errorDetail) {
                    const operationError = errorDetail.operations;
                    const transactionError = errorDetail.transaction;

                    if (operationError === "tx_insufficient_balance") {
                        errorMessage = "Insufficient XLM balance to process transaction";
                    } else if (operationError === "payment_underfunded") {
                        errorMessage = "Insufficient Balance on your account";
                    } else {
                        errorMessage += `: ${transactionError || operationError || 'Unknown'}`;
                    }
                }

                console.log("errorMessage", errorMessage);
                return this.MakeResponse(203, errorMessage);
            }
        } catch (e: any) {
            console.error("Error during account sponsorship:", e);
            return this.MakeResponse(500, e.message || "Unknown error during sponsorship");
        }
    }
    MakeResponse(status: number, errorMessage: string){
        return {
            status: status,
            message: errorMessage
         } as any;
    }

    async generateKeypair() {
        const keypair = Keypair.random();
        return {
            publicKey: keypair.publicKey(),
            secret: keypair.secret(),
            mnemonic: '' // TODO: Implement mnemonic generation if needed
        };
    }

    getAirdropAccount(): Keypair {
        return this.airdropKeypair;
    }

    async getKeypairFromSecret(secret: string): Promise<Keypair> {
        return Keypair.fromSecret(secret);
    }

    async makePayment(params: {
        senderKeyPair: Keypair;
        recipientPublicKey: string;
        assetCode: string;
        assetIssuer: string;
        amount: string;
        memo: string;
    }): Promise<string> {
        try {
            const { senderKeyPair, recipientPublicKey, assetCode, assetIssuer, amount, memo } = params;
            const asset = new Asset(assetCode, assetIssuer);
            console.log("asset", asset);
            const sourceAccount = await this.server.loadAccount(senderKeyPair.publicKey());

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: '100',
                networkPassphrase: Networks.TESTNET
            })
                .addOperation(Operation.payment({
                    destination: recipientPublicKey,
                    asset,
                    amount
                }))
                .addMemo(Memo.text(memo))
                .setTimeout(30)
                .build();

            transaction.sign(senderKeyPair);
            const result = await this.server.submitTransaction(transaction);
            return result.hash;
        } catch (error) {
            console.error('Payment failed:', error);
            return 'failed';
        }
    }
}

export default Stellar; 