# kata-humanlike-ogs

Run a KataGo humanSL `rank_5k` bot on OGS through [`online-go/gtp2ogs`](https://github.com/online-go/gtp2ogs).

This repo is intentionally small: `gtp2ogs` handles OGS, and KataGo handles GTP move generation using the human SL model.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set:

- `OGS_API_KEY`: API key from the OGS bot profile page.
- `KATAGO_MODEL`: regular/full KataGo model for `-model`.
- `KATAGO_HUMAN_MODEL`: human SL model, usually `b18c384nbt-humanv0.bin.gz`.

The checked-in defaults use the local paths found on this machine:

```text
/opt/homebrew/bin/katago
/Users/davidma/.katrain/kata1-b28c512nbt-s12704148736-d5790336910.bin.gz
/Users/davidma/.katrain/b18c384nbt-humanv0.bin.gz
```

## Smoke Test KataGo

Before connecting to OGS:

```bash
npm run smoke:gtp
```

This starts KataGo in GTP mode, plays one black move, asks it to generate white's move, and exits.

## Run on OGS

```bash
npm start
```

Extra `gtp2ogs` arguments can be supplied in `.env`:

```bash
GTP2OGS_EXTRA_ARGS="--beta --debug"
```

The bot command launched by `scripts/start.mjs` is equivalent to:

```bash
gtp2ogs --apikey "$OGS_API_KEY" -- \
  "$KATAGO_BIN" gtp \
  -model "$KATAGO_MODEL" \
  -human-model "$KATAGO_HUMAN_MODEL" \
  -config config/katago-human-rank-5k.cfg
```

## HumanSL Profile

The important KataGo config line is:

```text
humanSLProfile = rank_5k
```

This differs from KataGo's bundled `gtp_human5k_example.cfg`, which uses `preaz_5k`. The `rank_5k` profile matches modern post-AlphaZero human openings, which is the same profile naming style used by `rankmle` when querying KataGo analysis with `overrideSettings.humanSLProfile`.

## OGS Bot Account Notes

`gtp2ogs` requires an OGS bot account and API key. Per the `gtp2ogs` README, create a separate bot account, ask an OGS moderator to flag it as a bot account, then generate the API key from the bot profile while logged in as the human operator.
