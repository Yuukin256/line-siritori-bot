import { Client, validateSignature, WebhookEvent, TextMessage } from '@line/bot-sdk';
import { Handler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import stations from './stations';

// LINE クライアント
const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
});

// Lambda 関数
export const handler: Handler = async (req: APIGatewayProxyEvent, context: Context) => {
  const body: string = req.body || '';
  const channelSecret: string = process.env.CHANNEL_SECRET || '';
  const signature: string = req.headers['x-line-signature'];

  // 署名検証に失敗
  // LINE 以外のイベントもここで弾かれる
  if (!validateSignature(body, channelSecret, signature)) {
    let res = {
      statusCode: 403,
      body: JSON.stringify({
        result: '署名検証に失敗しました',
      }),
    };
    context.succeed(res);
  }
  // 署名検証に成功
  else {
    const events: Array<WebhookEvent> = JSON.parse(body).events;
    // 飛んできたイベントを操作関数に渡す
    await Promise.all(
      events.map(async (event) => {
        return handleEvent(event);
      })
    )
      .catch((err) => console.log(err))
      .then(() => {
        let res = {
          statusCode: 200,
          body: JSON.stringify({
            result: '処理完了',
          }),
        };
        context.succeed(res);
      });
  }
};

// LINE イベント用操作関数
async function handleEvent(event: WebhookEvent) {
  console.log(event);

  // メッセージ以外 ユーザーID不良を弾く
  if (event.type !== 'message' || !event.source.userId) {
    return null;
  }

  let res: TextMessage[] = Array();
  // レス用関数
  const makeRes = (text: string): TextMessage => {
    return {
      type: 'text',
      text: text,
    };
  };

  // テキストメッセージ以外を弾く
  if (event.message.type !== 'text') {
    res.push(makeRes('文字しか分かりません…'));
    return client.replyMessage(event.replyToken, res);
  }

  // 本当はひらがなしか受け付けない所を、やさしさでカタカナをひらがなに置換
  const messageText: string = event.message.text.replace(/[ァ-ン]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0x60)
  );
  // ひらがな以外を含むメッセージを弾く
  if (messageText.match(/^[ぁ-んー]*$/)) {
    // メッセージを反転、小文字を大文字に置換
    const messageTextArray: string[] = Array.from(messageText)
      .reverse()
      .map((l) => {
        return l
          .replace('っ', 'つ')
          .replace('ゃ', 'や')
          .replace('ゅ', 'ゆ')
          .replace('ょ', 'よ')
          .replace('ぁ', 'あ')
          .replace('ぃ', 'い')
          .replace('ぅ', 'う')
          .replace('ぇ', 'え')
          .replace('ぉ', 'お');
      });
    let resFirstCharacter: string;

    // メッセージをチェック
    for (let i: number = 0; i < messageTextArray.length; i++) {
      resFirstCharacter = messageTextArray[i];

      // 最後の文字が長音以外
      if (resFirstCharacter !== 'ー') {
        // Bot 側の負け処理用の関数
        const checkLose = () => {
          if (res.slice(-1)[0].text.slice(-1) === 'ん') {
            res.push(makeRes('あ、ぼくの負けだ…。ぼくに勝つなんてすごい！'));
            res.push(makeRes('次はあなたの番だよ！'));
          }
        };

        // 送信元の負け -> 全駅名からランダム返信
        if (resFirstCharacter === 'ん') {
          const allStations: string[] = Object.values(stations).flat();
          let stationIndex: number = Math.floor(Math.random() * allStations.length);
          res.push(makeRes('残念、あなたの負け！'));
          res.push(makeRes('じゃあぼくから行くね！'));
          res.push(makeRes(allStations[stationIndex]));
          checkLose();
        }
        // 送信元の負けではない
        else {
          // 返す言葉がある
          if (resFirstCharacter in stations) {
            let stationIndex = Math.floor(Math.random() * stations[resFirstCharacter].length);
            res.push(makeRes(stations[resFirstCharacter][stationIndex]));
            checkLose();
          }
          // 返す言葉がない
          else {
            res.push(makeRes('返す言葉がないからぼくの負けだ…。ぼくに勝つなんてすごい！'));
            res.push(makeRes('次はあなたの番だよ！'));
          }
        }
        // 返信送信
        return client.replyMessage(event.replyToken, res);
      }
    }
    // for を抜けるのは全て長音
    res.push(makeRes('返す言葉がないからぼくの負けだ…。ぼくに勝つなんてすごい！'));
    res.push(makeRes('でも長音ばっかりなんてズルいよ！'));
    res.push(makeRes('次はあなたの番だよ！'));
    return client.replyMessage(event.replyToken, res);
  }
  // ひらがな以外を含む
  else {
    res.push(makeRes('全部ひらがなで送ってください'));
    // 返信送信
    return client.replyMessage(event.replyToken, res);
  }
}
