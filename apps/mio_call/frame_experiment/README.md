# 枠がマイクを止めているのか — 実測

推測をやめるための実験。**マイクは存在し、許可済み**の状態にしたうえで、
同じページを3通りの置き方で開き、`getUserMedia` の結果だけを見る。
拒否しうる要素は「枠の指定」だけになる。

## 結果

| 置き方 | featurePolicy | permissions | getUserMedia |
|---|---|---|---|
| トップレベル | true | granted | **使えた** |
| 同一オリジンの枠（allow なし） | true | granted | **使えた** |
| **別オリジンの枠（allow なし）** | **false** | granted | **NotAllowedError: Permission denied** |
| 別オリジンの枠（`allow="microphone"`） | true | granted | **使えた** |

**枠の `allow` 指定だけで結果が変わる。**他は何も変えていない。

## 途中で間違えたこと

最初は同一オリジンの枠で試して「allow がなくても使える」と出た。
マイクの既定値は `self` なので、**同一オリジンの子フレームは指定なしでも継承する。**
止まるのは**別オリジンの枠**だけ。Artifact は専用オリジンで配信されるため、
こちらが該当する。最初の実験は条件が違っていた。

## 実機の症状との一致

報告された症状は「ダイアログが出ないまま即座に NotAllowedError」。
上表の3行目と同じ。

注意すべき点として、**`permissions.query` は granted のまま**である。
つまり「ブラウザの許可」を見ても原因は分からない。
分かるのは `featurePolicy.allowsFeature('microphone')` のほうだけ。

## 再現方法

```
python3 -m http.server 8899 --bind 127.0.0.1   # このディレクトリで
python3 -m http.server 8900 --bind 127.0.0.1   # 同じ内容を別ポートで
node run.js
```
