import fs from 'fs'
import fsExtra from 'fs-extra'
import _ from 'lodash'
import path from 'path'
import { ipcMain, app } from 'electron'
import { hdUtil, ccUtil } from 'wanchain-js-sdk'
import Logger from '~/src/utils/Logger'
import setting from '~/src/utils/Settings'
import Web3 from 'web3';
import { dateFormat } from '../app/utils/support';
import Identicon from 'identicon.js';
import keccak from 'keccak';

const web3 = new Web3();
import { Windows, walletBackend } from '~/src/modules'
import menuFactoryService from '~/src/services/menuFactory'

const logger = Logger.getLogger('controllers')
const ipc = ipcMain

// route consts
const ROUTE_PHRASE = 'phrase'
const ROUTE_WALLET = 'wallet'
const ROUTE_ADDRESS = 'address'
const ROUTE_ACCOUNT = 'account'
const ROUTE_TX = 'transaction'
const ROUTE_QUERY = 'query'
const ROUTE_STAKING = 'staking'
const ROUTE_SETTING = 'setting'

// db collection consts
const DB_NORMAL_COLLECTION = 'normalTrans'

// wallet path consts
const WANBIP44Path = "m/44'/5718350'/0'/0/"

// chain ID consts
const WAN_ID = 5718350;

ipc.on(ROUTE_PHRASE, (event, actionUni, payload) => {
    let err, phrase, ret
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'generate':
            try {
                phrase = hdUtil.generateMnemonic(payload.pwd)

            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_PHRASE, [action, id].join('#')].join('_'), event, { err: err, data: phrase })

            break
        case 'has':
            try {
                ret = hdUtil.hasMnemonic()
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_PHRASE, [action, id].join('#')].join('_'), event, { err: err, data: ret })

            break
        case 'reveal':
            try {
                phrase = hdUtil.revealMnemonic(payload.pwd)

            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_PHRASE, [action, id].join('#')].join('_'), event, { err: err, data: phrase })

            break
        case 'import':
            try {
                ret = hdUtil.importMnemonic(payload.phrase, payload.pwd)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_PHRASE, [action, id].join('#')].join('_'), event, { err: err, data: !!ret })
            break

        case 'reset':
            try {
                fsExtra.removeSync(path.join(setting.userDataPath, 'Db'))
                fsExtra.removeSync(path.join(setting.userDataPath, 'config.json'))
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            app.relaunch()
            app.exit(0)

            break
    }
})

ipc.on(ROUTE_WALLET, async (event, actionUni, payload) => {
    let err
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'lock':
            try {
                hdUtil.deleteHDWallet()
                hdUtil.deleteKeyStoreWallet()
                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: true })

            } catch (e) {
                logger.error(e.message || e.stack)
                err = e

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: false })
            }

            break
        case 'unlock':
            let phrase
            try {
                phrase = hdUtil.revealMnemonic(payload.pwd)
                hdUtil.initializeHDWallet(phrase)
                // create key file wallet
                hdUtil.newKeyStoreWallet(payload.pwd)
                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: true })
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: false })
            }

            break

        case 'getPubKeyChainId':
            {
                let { walletID, path } = payload
                let pubKey

                try {
                    pubKey = await hdUtil.getWalletSafe().getWallet(walletID).getPublicKey(path, true)
                } catch (e) {
                    logger.error(e.message || e.stack)
                    err = e
                }

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: pubKey })
                break
            }

        case 'getPubKey':
            {
                let pubKey

                try {
                    pubKey = await hdUtil.getWalletSafe().getWallet(payload.walletID).getPublicKey(payload.path)
                } catch (e) {
                    logger.error(e.message || e.stack)
                    err = e
                }

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: pubKey })
                break
            }

        case 'isConnected':
            {
                let ret = false;
                try {
                    hdUtil.getWalletSafe().getWallet(payload.walletID);
                    ret = true;
                } catch (e) {
                    ret = false
                }

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: ret })
                break
            }

        case 'signTransaction':
            {
                let sig = {};
                let { walletID, path, rawTx } = payload;
                let hdWallet = hdUtil.getWalletSafe().getWallet(walletID);

                logger.info('Sign transaction:');
                logger.info('wallet ID:' + walletID + ', path:' + path + ', raw:' + rawTx);

                try {
                    let ret = await hdWallet.sec256k1sign(path, rawTx);
                    sig.r = '0x' + ret.r.toString('hex');
                    sig.s = '0x' + ret.s.toString('hex');
                    sig.v = '0x' + ret.v.toString('hex');
                    logger.info('Signature:' + JSON.stringify(sig));
                } catch (e) {
                    logger.error(e.message || e.stack)
                    err = e
                }

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: sig })
                break
            }

        case 'connectToLedger':
            let data = false;
            try {
                await hdUtil.connectToLedger()
                data = true;
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: data })
            break

        case 'deleteLedger':
            {
                try {
                    await hdUtil.disconnectLedger()
                } catch (e) {
                    logger.error(e.message || e.stack)
                    err = e
                }

                sendResponse([ROUTE_WALLET, [action, id].join('#')].join('_'), event, { err: err, data: true })
                break
            }
    }
})

ipc.on(ROUTE_ADDRESS, async (event, actionUni, payload) => {
    let err, address, nonce
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'get':
            try {
                address = await hdUtil.getAddress(payload.walletID, payload.chainType, payload.start, payload.end)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: address })
            break

        case 'getOne':
            try {
                address = await hdUtil.getAddress(payload.walletID, payload.chainType, payload.path)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: address })
            break

        case 'getNonce':
            try {
                logger.info('getNonce called');
                // nonce = await ccUtil.getNonceByLocal(payload.addr, payload.chainType)
                nonce = await ccUtil.getNonce(payload.addr, payload.chainType, payload.includePending)
                logger.info('Nonce: ' + payload.addr + ',' + nonce);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: nonce })
            break
        case 'balance':
            let balance
            const { addr } = payload

            try {
                if (_.isArray(addr) && addr.length > 1) {
                    const addresses = addr.map(item => `0x${item}`)
                    balance = await ccUtil.getMultiWanBalances(addresses)

                } else {
                    balance = await ccUtil.getWanBalance(`0x${addr}`)
                    balance = { [`0x${addr}`]: balance }
                }
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: balance })
            break

        case 'isWanAddress':
            let ret;
            try {
                ret = await ccUtil.isWanAddress(payload.address);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'isValidatorAddress':
            try {
                ret = await ccUtil.isWanAddress(payload.address);
                let info = await ccUtil.getValidatorInfo('wan', payload.address);

                if (!info || info.feeRate == 10000) {
                    ret = false;
                }
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'fromKeyFile':
            const { keyFilePwd, hdWalletPwd, keyFilePath } = payload;
            const keyFileContent = fs.readFileSync(keyFilePath).toString();
            const keyStoreObj = JSON.parse(keyFileContent)
            try {
                let path = hdUtil.importKeyStore(`${WANBIP44Path}0`, keyFileContent, keyFilePwd, hdWalletPwd);

                hdUtil.createUserAccount(5, `${WANBIP44Path}${path}`, { name: `Imported${path + 1}`, addr: `0x${keyStoreObj.address}`.toLowerCase() });
                Windows.broadcast('notification', 'keyfilepath', { path, addr: keyStoreObj.address.toLowerCase() });

                sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: true })
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e

                sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: false })
            }

            break

        case 'getKeyStoreCount':
            let count;
            try {
                count = hdUtil.getKeyStoreCount(WAN_ID);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ADDRESS, [action, id].join('#')].join('_'), event, { err: err, data: count })
            break

    }
})

ipc.on(ROUTE_ACCOUNT, (event, actionUni, payload) => {
    let err, ret
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'create':
            try {
                ret = hdUtil.createUserAccount(payload.walletID, payload.path, payload.meta)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ACCOUNT, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'get':
            try {
                ret = hdUtil.getUserAccount(payload.walletID, payload.path)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_ACCOUNT, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'getAll':
            try {
                ret = hdUtil.getUserAccountForChain(payload.chainID)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ACCOUNT, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break
        case 'update':
            try {
                ret = hdUtil.updateUserAccount(payload.walletID, payload.path, payload.meta)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ACCOUNT, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'delete':
            try {
                ret = hdUtil.deleteUserAccount(payload.walletID, payload.path)
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_ACCOUNT, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break
    }
})

ipc.on(ROUTE_TX, async (event, actionUni, payload) => {
    let ret, err
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'normal':
            try {
                console.log('payload', payload)
                let { walletID, chainType, symbol, path, to, amount, gasPrice, gasLimit, nonce, data } = payload
                let from = await hdUtil.getAddress(walletID, chainType, path)

                let input = {
                    "symbol": symbol,
                    "from": '0x' + from.address,
                    "to": to,
                    "amount": amount,
                    "gasPrice": gasPrice,
                    "gasLimit": gasLimit,
                    "BIP44Path": path,
                    "walletID": walletID,
                    "nonce": nonce,
                    "data": data
                }

                logger.info('Normal transaction: ' + JSON.stringify(input));

                let srcChain = global.crossInvoker.getSrcChainNameByContractAddr(symbol, chainType);
                ret = await global.crossInvoker.invokeNormalTrans(srcChain, input);
                logger.info('Transaction hash: ' + ret);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_TX, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'raw':
            try {
                logger.info('Send raw transaction: ' + JSON.stringify(payload))
                ret = await ccUtil.sendTrans(payload.raw, payload.chainType)
                logger.info('Transaction hash: ' + ret);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_TX, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        /**
         * tx = {
         *   from: from,
         *   to: to,
         *   value: value,
         *   data: data,
         *   gas: defaultGas
         * }
         */
        case 'estimateGas':
            try {
                logger.info('Try to estimate gas: ' + payload.chainType + ',' + JSON.stringify(payload.tx));
                ret = await ccUtil.estimateGas(payload.chainType, payload.tx);
                logger.info('Estimated gas: ' + ret);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_TX, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'showRecords':
            try {
                ret = global.wanDb.queryComm(DB_NORMAL_COLLECTION, (items) => {
                    return items
                })
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_TX, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'insertTransToDB':
            try {
                ccUtil.insertNormalTx(payload.rawTx, undefined, undefined, payload.satellite);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_TX, [action, id].join('#')].join('_'), event, { err: err, data: true })
            break;
    }
})

ipc.on(ROUTE_QUERY, async (event, actionUni, payload) => {
    let ret, err
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'config':
            let { param } = payload

            try {
                let conf
                if (param === 'sdkStatus') {
                    conf = global.chainManager ? 'ready' : 'init'
                } else {
                    conf = setting[`${param}`]
                }

                ret = { [param]: conf }
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_QUERY, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'getGasPrice':
            try {
                ret = await ccUtil.getGasPrice(payload.chainType);
                logger.info('Gas price: ' + payload.chainType + ',' + ret);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_QUERY, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;
    }

})

ipc.on(ROUTE_STAKING, async (event, actionUni, payload) => {
    let ret, err
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'getContractAddr':
            ret = setting.cscContractAddr;
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'getCurrentEpochInfo':
            try {
                ret = await ccUtil.getCurrentEpochInfo('wan');
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'PosStakeUpdateFeeRate':
            try {
                logger.info('PosStakeUpdateFeeRate: ' + payload);

                let { tx } = payload;
                let gasPrice = await ccUtil.getGasPrice('wan');
                tx.gasLimit = 200000;
                tx.gasPrice = web3.utils.fromWei(gasPrice, 'gwei');
                ret = await global.crossInvoker.PosStakeUpdateFeeRate(tx);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'info':
            try {
                let accounts = payload;
                let delegateInfo = [];
                let incentive = [];
                logger.info('Get PoS info...')

                if (!global.slotCount) {
                    [global.slotCount, global.slotTime] = await Promise.all([ccUtil.getSlotCount('wan'), ccUtil.getSlotTime('wan')]);
                }

                let stakeInfoArray = accounts.map(async account => {
                    let info = await ccUtil.getDelegatorStakeInfo('wan', account.address);
                    if (info && info.length && info.length > 0) {
                        delegateInfo.push({ account: account, stake: info });
                    }
                });

                let DelegateIncentiveArray = accounts.map(async account => {
                    let inc = await ccUtil.getDelegatorIncentive('wan', account.address);
                    if (inc && inc.length && inc.length > 0) {
                        incentive.push({ account: account, incentive: inc });
                    }
                });

                let promiseArray = [ccUtil.getEpochID('wan'), ccUtil.getCurrentStakerInfo('wan'), ccUtil.getDelegatorSupStakeInfo('wan', accounts.map(val => val.address))].concat(stakeInfoArray).concat(DelegateIncentiveArray);
                let retArray = await Promise.all(promiseArray);
                let epochID = retArray[0];
                let stakeInfo = retArray[1];

                logger.info('Get PoS info: epochId ' + epochID);

                if (stakeInfo.length > 0) {
                    let prms = []
                    for (let i = 0; i < stakeInfo.length; i++) {
                        prms.push(getNameAndIcon(stakeInfo[i].address));
                    }

                    let prmsRet = await Promise.all(prms);

                    for (let i = 0; i < stakeInfo.length; i++) {
                        if (prmsRet && prmsRet[i]) {
                            let info = prmsRet[i];
                            stakeInfo[i].name = info[0].name;
                            stakeInfo[i].iconData = (info[0].iconData && info[0].iconData.length > 10) ? 'data:image/' + info[0].iconType + ';base64,' + info[0].iconData : ('data:image/png;base64,' + new Identicon(stakeInfo[i].address).toString());
                        }
                    }
                }

                ret = { base: {}, list: [] }
                ret.base = buildStakingBaseInfo(delegateInfo, incentive, epochID, stakeInfo);
                ret.list = await buildStakingList(delegateInfo, incentive, epochID, ret.base, retArray[2]);

                ret.stakeInfo = stakeInfo;
            } catch (e) {
                logger.error(actionUni + (e.message || e.stack))
                err = e
            }
            logger.info('Get PoS info finished')
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'validatorInfo':
            try {
                let { addr } = payload
                ret = await ccUtil.getValidatorStakeInfo('wan', addr);

            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'delegateIn':
            try {
                logger.info('delegateIn:' + JSON.stringify(payload));
                let tx = payload;

                let validatorInfo = await ccUtil.getValidatorInfo('wan', tx.validatorAddr);
                if (!validatorInfo || validatorInfo.feeRate == 10000) {
                    throw new Error('Validator Address is Invalid');
                }

                let gasPrice = await ccUtil.getGasPrice('wan');

                let gasLimit = 200000;
                tx.gasPrice = web3.utils.fromWei(gasPrice, 'gwei');;
                tx.gasLimit = gasLimit;

                ret = await global.crossInvoker.PosDelegateIn(tx);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'delegateOut':
            try {
                logger.info('delegateOut:' + payload);

                let tx = payload;
                let gasPrice = await ccUtil.getGasPrice('wan');

                let gasLimit = 200000;
                let gasPriceGwei = web3.utils.fromWei(gasPrice, 'gwei');;

                let input = {
                    "from": tx.from,
                    "validatorAddr": tx.validator,
                    "amount": 0,
                    "gasPrice": gasPriceGwei,
                    "gasLimit": gasLimit,
                    "BIP44Path": tx.path,
                    "walletID": tx.walletID,
                    "stakeAmount": tx.stakeAmount,
                }

                ret = await global.crossInvoker.PosDelegateOut(input);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'registerValidator':
            try {
                let { tx } = payload;
                let key = Buffer.from(tx.secPk.toLowerCase().replace('0x', '').substring(2), 'hex');
                let address = '0x' + keccak('keccak256').update(key).digest().slice(-20).toString('hex');
                let gasPrice = await ccUtil.getGasPrice('wan');

                tx.gasLimit = 200000;
                tx.minerAddr = address;
                tx.gasPrice = web3.utils.fromWei(gasPrice, 'gwei');
                logger.info('Register validator:' + JSON.stringify(tx));
                ret = await global.crossInvoker.PosStakeRegister(tx);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break
        case 'validatorAppend':
            try {
                logger.info('validatorAppend: ' + payload);

                let { tx } = payload;
                let gasPrice = await ccUtil.getGasPrice('wan');
                tx.gasLimit = 200000;
                tx.gasPrice = web3.utils.fromWei(gasPrice, 'gwei');
                let ret = await global.crossInvoker.PosStakeAppend(tx);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break
        case 'validatorUpdate':
            try {
                logger.info('validatorUpdate: ' + payload);
                let { tx } = payload;
                let gasPrice = await ccUtil.getGasPrice('wan');
                tx.gasLimit = 200000;
                tx.gasPrice = web3.utils.fromWei(gasPrice, 'gwei');
                let ret = await global.crossInvoker.PosStakeUpdate(tx);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'getContractData':
            try {
                let validatorAddr = payload.validatorAddr;
                let func = payload.func;

                var cscDefinition = [{ "constant": false, "inputs": [{ "name": "addr", "type": "address" }, { "name": "lockEpochs", "type": "uint256" }, { "name": "feeRate", "type": "uint256" }], "name": "stakeUpdate", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [{ "name": "addr", "type": "address" }], "name": "stakeAppend", "outputs": [], "payable": true, "stateMutability": "payable", "type": "function" }, { "constant": false, "inputs": [{ "name": "secPk", "type": "bytes" }, { "name": "bn256Pk", "type": "bytes" }, { "name": "lockEpochs", "type": "uint256" }, { "name": "feeRate", "type": "uint256" }], "name": "stakeIn", "outputs": [], "payable": true, "stateMutability": "payable", "type": "function" }, { "constant": false, "inputs": [{ "name": "delegateAddress", "type": "address" }], "name": "delegateIn", "outputs": [], "payable": true, "stateMutability": "payable", "type": "function" }, { "constant": false, "inputs": [{ "name": "delegateAddress", "type": "address" }], "name": "delegateOut", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }];

                let data = ccUtil.getDataByFuncInterface(cscDefinition,
                    setting.cscContractAddr,
                    func,
                    validatorAddr);

                ret = data;
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'insertTransToDB':
            try {
                logger.info('insertTransToDB:' + payload);
                let satellite = {
                    validator: payload.rawTx.validator,
                    annotate: payload.rawTx.annotate,
                    stakeAmount: payload.rawTx.stakeAmount,
                }
                await ccUtil.insertNormalTx(payload.rawTx, 'Sent', "external", satellite);
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'posInfo':
            try {
                ret = {};
                let info = await ccUtil.getPosInfo('wan')
                if (info) {
                    ret.firstEpochId = info.firstEpochId;
                }

                ret.slotCount = await ccUtil.getSlotCount('wan');
                ret.slotTime = await ccUtil.getSlotTime('wan');
                global.slotCount = ret.slotCount;
                global.slotTime = ret.slotTime;
                global.firstEpochId = ret.firstEpochId;

            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;

        case 'getValidatorsInfo':
            try {
                let { address } = payload;
                if (address.length === 0) {
                    ret = []
                } else {
                    let [ret0, ret1] = await Promise.all([ccUtil.getValidatorTotalIncentive('wan', address), ccUtil.getValidatorSupStakeInfo('wan', address)])
                    ret0.forEach(item => {
                        let index = ret1.findIndex(val => val.address === item.address);
                        item.stakeInTimestamp = index !== -1 ? ret1[index].stakeInTimestamp : 0;
                    });
                    ret = ret0;
                }
            } catch (e) {
                logger.info(e)
                logger.error(e.message || e.stack)
                err = e
            }
            sendResponse([ROUTE_STAKING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break;
    }
})

ipc.on(ROUTE_SETTING, async (event, actionUni, payload) => {
    let ret, err, keys, vals = []
    const [action, id] = actionUni.split('#')

    switch (action) {
        case 'switchNetwork':

            let choice = parseInt(payload.choice)
            let mainWin = Windows.getByType('main')
            let switchWin = Windows.getByType('changeNetwork')

            if (choice === 1) {
                try {

                    setting.switchNetwork()

                    Windows.broadcast('notification', 'sdk', 'init')

                    await walletBackend.init()

                    Windows.broadcast('notification', 'network', setting.network)
                } catch (e) {
                    logger.error(e.message || e.stack)
                    err = e
                }
            } else if (choice === 0) {
                try {
                    const networkMenu = menuFactoryService.networkMenu
                    const [targetMenu] = networkMenu.items.filter(i => !i.checked)
                    targetMenu.checked = true
                } catch (e) {
                    logger.error(e.message || e.stack)
                    err = e
                }
            }

            mainWin.show()
            switchWin.close()

            break

        case 'set':
            keys = Object.keys(payload)
            vals = Object.values(payload)

            try {
                keys.forEach((key, index) => {
                    let newValue = key === 'settings' ? Object.assign(setting.get('settings'), vals[index]) : vals[index]
                    setting.set(key, newValue)
                })
                ret = true
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e

                ret = false
            }

            sendResponse([ROUTE_SETTING, [action, id].join('#')].join('_'), event, { err: err, data: ret })
            break

        case 'get':
            let { keys } = payload

            try {
                keys.forEach((key, index) => {
                    vals[index] = setting.get(key)
                })
            } catch (e) {
                logger.error(e.message || e.stack)
                err = e
            }

            sendResponse([ROUTE_SETTING, [action, id].join('#')].join('_'), event, { err: err, data: vals })
            break
    }
})




function sendResponse(endpoint, e, payload) {
    const id = e.sender.id
    const senderWindow = Windows.getById(id)
    const { err } = payload

    if (_.isObject(err) || !_.isEmpty(err)) payload.err = errorWrapper(err)
    senderWindow.send('renderer_windowMessage', endpoint, payload)
}

function errorWrapper(err) {
    return { desc: err.message, code: err.errno, cat: err.name }
}

function buildStakingBaseInfo(delegateInfo, incentive, epochID, stakeInfo) {
    let base = {
        myStake: "N/A",
        validatorCnt: "N/A",
        pendingWithdrawal: "N/A",
        epochID: "Epoch N/A",
        epochIDRaw: "N/A",
        epochEndTime: "N/A",
        currentTime: "N/A",
        currentRewardRate: "N/A %",
        stakePool: 0,
        currentRewardRateChange: "↑",
        totalDistributedRewards: "N/A",
        startFrom: dateFormat((new Date()) / 1000),
    };

    let totalStake = web3.utils.toBN(0);
    let withdrawStake = web3.utils.toBN(0);
    let validator = {};
    let totalReward = web3.utils.toBN(0);
    for (let i = 0; i < delegateInfo.length; i++) {
        const info = delegateInfo[i].stake;
        for (let m = 0; m < info.length; m++) {
            const staker = info[m];
            totalStake = web3.utils.toBN(staker.amount).add(totalStake);
            if (staker.quitEpoch != 0) {
                withdrawStake = web3.utils.toBN(staker.amount).add(withdrawStake);
            }

            if (!validator[staker.address]) {
                validator[staker.address] = web3.utils.toBN(staker.amount);
            } else {
                validator[staker.address] = web3.utils.toBN(staker.amount).add(validator[staker.address]);
            }
        }
    }

    for (let i = 0; i < incentive.length; i++) {
        const inc = incentive[i].incentive;
        for (let m = 0; m < inc.length; m++) {
            const one = inc[m];
            totalReward = web3.utils.toBN(one.amount).add(totalReward);
        }
    }

    base.myStake = Number(web3.utils.fromWei(totalStake.toString())).toFixed(0);
    base.pendingWithdrawal = Number(web3.utils.fromWei(withdrawStake.toString())).toFixed(0);
    base.totalDistributedRewards = Number(web3.utils.fromWei(totalReward.toString())).toFixed(2);

    base.validatorCnt = Object.getOwnPropertyNames(validator).length;

    if (typeof epochID === "number") {
        base.epochIDRaw = epochID;
    }

    let stakePool = web3.utils.toBN(0)
    if (stakeInfo) {
        for (let i = 0; i < stakeInfo.length; i++) {
            const si = stakeInfo[i];
            stakePool = web3.utils.toBN(si.amount).add(stakePool);
            for (let m = 0; m < si.clients.length; m++) {
                const cl = si.clients[m];
                stakePool = web3.utils.toBN(cl.amount).add(stakePool);
            }

            for (let m = 0; m < si.partners.length; m++) {
                const pr = si.partners[m];
                stakePool = web3.utils.toBN(pr.amount).add(stakePool);
            }
        }
    }

    base.stakePool = Number(web3.utils.fromWei(stakePool.toString())).toFixed(0);

    return base;
}

async function buildStakingList(delegateInfo, incentive, epochID, base, delegatorSupStakeInfo) {
    let list = [];

    for (let i = 0; i < delegateInfo.length; i++) {
        const di = delegateInfo[i];
        for (let m = 0; m < di.stake.length; m++) {
            const sk = di.stake[m]
            let ret = await getNameAndIcon(sk.address);
            let img, name;
            if (ret && ret.length > 0) {
                img = (ret[0].iconData && ret[0].iconData.length > 10) ? 'data:image/' + ret[0].iconType + ';base64,' + ret[0].iconData : ('data:image/png;base64,' + new Identicon(sk.address).toString());
                name = ret[0].name;
            }

            list.push({
                myAccount: di.account.name,
                balance: di.account.balance,
                accountAddress: di.account.address,
                accountPath: di.account.path,
                myStake: { title: web3.utils.fromWei(sk.amount), bottom: "0" },
                validator: {
                    name: name ? name : sk.address,
                    img: img,
                },
                validatorAddress: sk.address,
                distributeRewards: { title: "50,000", bottom: "from 50 epochs" },
                modifyStake: ["+", "-"],
                quitEpoch: sk.quitEpoch
            })
        }
    }

    let longestDays = 0;
    for (let i = 0; i < list.length; i++) {
        let validatorAddress = list[i].validatorAddress;
        let accountAddress = list[i].accountAddress;
        let distributeRewards = web3.utils.toBN(0);
        let epochs = [];

        for (let m = 0; m < incentive.length; m++) {
            const inc = incentive[m];
            if (accountAddress == inc.account.address) {

                for (let n = 0; n < inc.incentive.length; n++) {
                    const obj = inc.incentive[n];

                    if (obj.address.toLowerCase() == validatorAddress.toLowerCase()) {
                        distributeRewards = web3.utils.toBN(obj.amount).add(distributeRewards);
                        if (!epochs.includes(obj.epochId)) {
                            epochs.push(obj.epochId);
                        }
                    }
                }
            }
        }

        if (epochs.length > 0) {
            epochs.sort((a, b) => { return a - b })
            let days = (epochID - epochs[0]) * (global.slotCount * global.slotTime) / (24 * 3600); // 1 epoch last 2 days.
            if (days > longestDays) {
                longestDays = days;
            }
        }
        list[i].distributeRewards = { title: Number(web3.utils.fromWei(distributeRewards)).toFixed(2), bottom: (epochs.length) };
        let d = new Date()
        d.setDate(d.getDate() - longestDays);
        base.startFrom = dateFormat(d / 1000);
        delegatorSupStakeInfo.forEach(item => {
            let index = list.findIndex(val => val.accountAddress.toLowerCase() === item.address && val.validatorAddress === item.vAddress);
            if (index !== -1) {
                list[index].myStake.bottom = item.delegateInTimestamp;
            }
        })

    }

    return list;
}

async function getNameAndIcon(address) {
    let addr = address;
    let ret = undefined;
    if (!global.nameIcon) {
        global.nameIcon = {};
        global.nameIconUpdateTime = {};
    }

    let value = global.nameIcon[addr];
    if (!value) {
        let nowTime = Date.now()
        if (!global.nameIconUpdateTime[addr] || (nowTime > (global.nameIconUpdateTime[addr] + 3 * 60 * 1000))) {
            value = await ccUtil.getRegisteredValidator(addr);
            if (!value || value.length == 0) {
            } else {
                global.nameIcon[addr] = value;
                ret = value;
            }

            global.nameIconUpdateTime[addr] = Date.now();
        }
    } else {
        ret = value;
    }
    return ret;
}