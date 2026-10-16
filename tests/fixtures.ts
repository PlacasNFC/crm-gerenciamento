import { dvChave } from "@/lib/nfe";

export const CNPJ_EMPRESA = "11222333000181";
// cUF + AAMM + CNPJ + modelo + série + número + tpEmis + cNF = 43 dígitos
const base = "35" + "2610" + CNPJ_EMPRESA + "55" + "001" + "000000123" + "1" + "12345678";
if (base.length !== 43) throw new Error("fixture: chave base deve ter 43 dígitos");
export const CHAVE = base + dvChave(base);

export function nfeProc({ cStat = "100", chave = CHAVE, tpNF = "1", emitCnpj = CNPJ_EMPRESA, destDoc = "<CPF>52998224725</CPF>", dups = "" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF>
        <dhEmi>2026-10-15T10:30:00-03:00</dhEmi><tpNF>${tpNF}</tpNF></ide>
      <emit><CNPJ>${emitCnpj}</CNPJ><xNome>PLACAS NFC LTDA</xNome><enderEmit><UF>SP</UF></enderEmit><CRT>1</CRT></emit>
      <dest>${destDoc}<xNome>Maria da Silva</xNome><enderDest><UF>RJ</UF></enderDest></dest>
      <det nItem="1"><prod><cProd>PL-001</cProd><cEAN>SEM GTIN</cEAN><xProd>Placa NFC Instagram</xProd><NCM>85235210</NCM>
        <CFOP>6108</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>45.0000000000</vUnCom><vProd>90.00</vProd></prod></det>
      <det nItem="2"><prod><cProd>PL-002</cProd><cEAN>7891234567895</cEAN><xProd>Placa NFC Wi-Fi</xProd><NCM>85235210</NCM>
        <CFOP>6108</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>39.9000000000</vUnCom><vProd>39.90</vProd></prod></det>
      <total><ICMSTot><vProd>129.90</vProd><vNF>129.90</vNF></ICMSTot></total>${dups}
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${chave}</chNFe><dhRecbto>2026-10-15T10:30:05-03:00</dhRecbto>
    <nProt>135260000000001</nProt><cStat>${cStat}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;
}

export function procCancelamento({ cStat = "135", chave = CHAVE } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <evento versao="1.00"><infEvento Id="ID110111${chave}01"><cOrgao>35</cOrgao><chNFe>${chave}</chNFe>
    <tpEvento>110111</tpEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>135260000000001</nProt>
    <xJust>Pedido cancelado pelo comprador</xJust></detEvento></infEvento></evento>
  <retEvento versao="1.00"><infEvento><cStat>${cStat}</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo>
    <chNFe>${chave}</chNFe><nProt>135260000000999</nProt></infEvento></retEvento>
</procEventoNFe>`;
}
