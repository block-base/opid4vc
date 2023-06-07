# opid4vc

This is OPID4VC wrapper

## Setting

Create .env file

- packages/issuer/.env

- packages/verifier/.env

## Demo

### Run server

```shell
$ yarn
```

Issuer

```shell
$ cd packages/issuer && yarn dev
```

Wallet

```shell
$ cd packages/wallet && yarn dev
```

Verifier

```shell
$ cd packages/verifier && yarn dev
```

### 環境

- PC (QR コードを読むのでカメラが必要)

### 実行手順

[Issue]

1. Wallet にアクセスします(dev の場合は http://localhost:3000 )

![代替テキスト](/assets/image1.png)

2. 新規のタブを開き、Issuer の QR 表示エンドポイントにアクセスします.
   (dev の場合は http://localhost:8000/qr)
   (pre-authorization flow を MS のテナントで実行する場合は requestUri を追加してください http://localhost:8000/qr?requestUri=<requestUri>)

3. 表示されている QR を Wallet ページのカメラから読み取ります。読み取ると Issuer Metadata が表示され Authorization から認証をします。

![代替テキスト](/assets/image2.png)

4. 認証が終わると access_token と取得した VC が表示されます。

![代替テキスト](/assets/image3.png)

[Present]

1. Wallet にアクセスします(dev の場合は http://localhost:3000 )

2. 新規のタブを開き、Verifier の QR 表示エンドポイントにアクセスします.
   (dev の場合は http://localhost:8001/qr)

3. 表示されている QR を Wallet ページのカメラから読み取ります。読み取ると提示可能な VC が表示され Present ボタンを押すと、Verifier に提示されます。Verify Status が verified になると検証が完了しています。(提示したデータに関しては Verifier の console で確認してください)

![代替テキスト](/assets/image4.png)
