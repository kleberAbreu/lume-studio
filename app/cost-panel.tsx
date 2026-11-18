import type {Version} from '../lib/studio/gallery';
import {conversationCost, costLabel, dollars} from '../lib/studio/costs';
import {Coins} from 'lucide-react';

export function CostPanel({version, family}:{version:Version; family:Version[]}) {
  const total = conversationCost(family);
  const receipt = version.receipt;
  const action = version.parent ? 'Esta edição' : 'Esta geração';
  return <section className="cost-panel" aria-label="Custos estimados em dólares">
    <h3><Coins size={16}/>Custo estimado em USD</h3>
    <dl>
      <div><dt>{version.original ? 'Upload do original' : action}</dt>
        <dd>{version.original || version.local ? dollars(0) : receipt ? dollars(receipt.nanoUsd) : 'Sem dados'}</dd></div>
      <div><dt>Conversa inteira</dt><dd>{costLabel(total)}</dd></div>
    </dl>
    {total.missing>0 && <p>{total.missing===1?'1 operação sem dados de consumo.':total.missing+' operações sem dados de consumo.'}</p>}
    <details><summary>Como foi calculado</summary>
      {receipt && <p>Nesta versão, a API registrou {receipt.text.toLocaleString('pt-BR')} tokens de texto e {receipt.image.toLocaleString('pt-BR')} de imagem na entrada, e {receipt.output.toLocaleString('pt-BR')} de imagem na saída. Tarifas de {receipt.rateDate.split('-').reverse().join('/')}.</p>}
      <p>O total inclui cada geração e edição salva desta conversa, em todos os ramos. A estimativa usa as tarifas padrão e considera descontos de cache quando identificados na resposta. Créditos, impostos e ajustes de fatura podem alterar o valor cobrado.</p>
      <a href="https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst" target="_blank" rel="noreferrer">Tarifas da OpenAI ↗</a>
    </details>
  </section>;
}
