# The House: Project Map

このファイルは自動生成されました。シーン間の繋がりと構造を示します。

## 玄関 (`entrance`)
### 移動先
- [[living|居間へ入る]]
### 調査要素
- 土間の靴を見る (`memory:shoes`)

---
## 庭 (`garden`)
### 移動先
- [[living|居間に戻る]]
### 調査要素
- 庭の隅の石碑を見る (`memory:garden_secret`)

---
## 居間 (`living`)
### 移動先
- [[entrance|玄関に戻る]]
- [[garden|庭を眺める]]
### 調査要素
- 仏壇を詳しく調べる (`memory:incense`)

---

## 接続図 (簡易リスト)
- `entrance` (玄関) ──[[ 居間へ入る ]]──> `living`
- `garden` (庭) ──[[ 居間に戻る ]]──> `living`
- `living` (居間) ──[[ 玄関に戻る ]]──> `entrance`
- `living` (居間) ──[[ 庭を眺める ]]──> `garden`
