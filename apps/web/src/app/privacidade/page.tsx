import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocLayout, LegalSection, Fill, type TocItem } from '@/components/legal/LegalDocLayout';
import { DATA_REQUEST_RESPONSE_DAYS, LEGAL_COMPANY as C, LEGAL_ROUTES, PRIVACY_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description:
    'Como a RR — Rafinha Running trata dados pessoais de treinadores, assessorias e atletas, conforme a LGPD (Lei 13.709/2018).',
  alternates: { canonical: '/privacidade' },
};

const TOC: TocItem[] = [
  { id: 'quem-somos', title: 'Quem somos e a quem se aplica' },
  { id: 'papeis', title: 'Plataforma e assessorias: quem decide o quê' },
  { id: 'encarregado', title: 'Encarregado (DPO)' },
  { id: 'dados-coletados', title: 'Dados que tratamos' },
  { id: 'dados-saude', title: 'Dados de saúde (dados sensíveis)' },
  { id: 'finalidades', title: 'Finalidades e bases legais' },
  { id: 'ia', title: 'Inteligência artificial' },
  { id: 'compartilhamento', title: 'Compartilhamento e operadores' },
  { id: 'transferencia', title: 'Transferência internacional' },
  { id: 'retencao', title: 'Por quanto tempo guardamos' },
  { id: 'seguranca', title: 'Segurança' },
  { id: 'direitos', title: 'Seus direitos' },
  { id: 'como-exercer', title: 'Como exercer seus direitos' },
  { id: 'menores', title: 'Crianças e adolescentes' },
  { id: 'cookies', title: 'Cookies e armazenamento local' },
  { id: 'incidentes', title: 'Incidentes de segurança' },
  { id: 'alteracoes', title: 'Alterações desta Política' },
  { id: 'contato', title: 'Contato e ANPD' },
];

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 mb-4 overflow-x-auto rounded-xl border border-gray-100">
      <table className="min-w-[560px]">{children}</table>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <LegalDocLayout
      title="Política de Privacidade"
      version={PRIVACY_VERSION}
      toc={TOC}
      sibling={{ href: LEGAL_ROUTES.terms, label: 'Termos de Uso' }}
      summary={
        <ul>
          <li>
            A RR é uma plataforma usada por <strong>treinadores e assessorias de corrida</strong> para acompanhar seus
            atletas. Cuidamos da sua conta; a sua assessoria decide como usar seus dados de treino e saúde.
          </li>
          <li>
            Dados de saúde (anamnese, frequência cardíaca, sono, peso, lesões, avaliações) são <strong>sensíveis</strong>:
            só tratamos com o seu <strong>consentimento específico</strong>, que você pode revogar a qualquer momento.
          </li>
          <li>
            Usamos serviços de terceiros (Strava, gateways de pagamento, e-mail, notificações, monitoramento de erros e
            provedores de IA), alguns <strong>fora do Brasil</strong>, sempre com as garantias exigidas pela LGPD.
          </li>
          <li>
            Análises com IA são <strong>solicitadas pelo seu treinador</strong> e revisadas por ele — nenhuma decisão com
            efeito jurídico é tomada só por máquina.
          </li>
          <li>
            <strong>Não vendemos seus dados</strong> e não usamos cookies de anúncios. Só cookies essenciais.
          </li>
          <li>
            Você pode baixar seus dados, mudar preferências e pedir a exclusão em{' '}
            <Link href={LEGAL_ROUTES.myData}>Meus dados</Link>. Respondemos em até {DATA_REQUEST_RESPONSE_DAYS} dias.
          </li>
        </ul>
      }
    >
      <LegalSection id="quem-somos" n={1} title="Quem somos e a quem esta Política se aplica">
        <p>
          Esta Política explica como a plataforma <strong>{C.tradeName}</strong> (&quot;RR&quot;, &quot;Plataforma&quot;,
          &quot;nós&quot;), operada por <Fill>{C.legalName}</Fill>, inscrita no CNPJ sob o nº <Fill>{C.cnpj}</Fill>, com
          sede em <Fill>{C.address}</Fill>, trata dados pessoais nos termos da Lei Geral de Proteção de Dados Pessoais
          (Lei nº 13.709/2018 — &quot;LGPD&quot;), do Marco Civil da Internet (Lei nº 12.965/2014) e do Código de Defesa do
          Consumidor (Lei nº 8.078/1990), quando aplicável.
        </p>
        <p>Ela se aplica a todas as pessoas que usam o site, o aplicativo web (PWA) e o aplicativo móvel da RR:</p>
        <ul>
          <li><strong>Atletas</strong> — alunos acompanhados por uma assessoria ou treinador;</li>
          <li><strong>Treinadores e assessorias</strong> — profissionais e empresas que usam a RR para gerir seus atletas;</li>
          <li><strong>Administradores</strong> da plataforma ou de contas white-label;</li>
          <li><strong>Visitantes</strong> — quem navega nas páginas públicas, preenche formulários de pré-cadastro, compra na loja ou se inscreve em eventos.</li>
        </ul>
        <p>
          Esta Política deve ser lida em conjunto com os <Link href={LEGAL_ROUTES.terms}>Termos de Uso</Link>.
        </p>
      </LegalSection>

      <LegalSection id="papeis" n={2} title="Plataforma e assessorias: quem decide o quê">
        <p>
          A RR é uma plataforma &quot;white-label&quot;: várias assessorias e treinadores independentes usam a mesma
          tecnologia, às vezes com a própria marca. Por isso, a responsabilidade pelos dados é dividida assim, em
          linguagem simples:
        </p>
        <h3>A RR é a controladora</h3>
        <p>
          Quando o tratamento serve para <strong>fazer a plataforma existir e funcionar</strong>, quem decide é a RR, que
          atua como <strong>controladora</strong> (LGPD, art. 5º, VI). Isso inclui: criação e segurança da sua conta,
          login, registros de acesso, prevenção a fraudes, cobrança das assinaturas dos treinadores, suporte,
          comunicações sobre a plataforma, cumprimento de obrigações legais e melhoria do produto.
        </p>
        <h3>A sua assessoria é a controladora dos dados de treino e saúde</h3>
        <p>
          Quando você é atleta de uma assessoria, é <strong>ela</strong> (ou o treinador responsável) quem decide quais
          dados de treino e de saúde coletar, para que usá-los e por quanto tempo, dentro da relação de treinamento que
          vocês têm. Nessa atividade a assessoria é a <strong>controladora</strong> e a RR atua como{' '}
          <strong>operadora</strong> (art. 5º, VII): tratamos esses dados em nome da assessoria, seguindo as instruções
          dela e as regras desta Política, sem usá-los para finalidades próprias incompatíveis.
        </p>
        <p>
          O mesmo vale para a <strong>loja</strong> e os <strong>eventos</strong> de cada assessoria: quem vende o
          produto ou organiza a prova é a assessoria; a RR fornece a tecnologia de pedidos e inscrições.
        </p>
        <h3>Na prática</h3>
        <ul>
          <li>Dúvidas sobre <strong>conta, login, segurança ou a plataforma</strong>: fale com a RR (seção 13).</li>
          <li>
            Dúvidas sobre <strong>o que sua assessoria faz com seus treinos, anamnese ou avaliações</strong>: fale também
            com a sua assessoria. Se preferir, fale com a RR — encaminharemos o pedido e ajudaremos a assessoria a
            atendê-lo (art. 39).
          </li>
          <li>
            As assessorias se comprometem, nos Termos de Uso, a tratar os dados dos seus atletas de acordo com a LGPD,
            inclusive quanto ao sigilo profissional e às bases legais adequadas.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="encarregado" n={3} title="Encarregado pelo tratamento de dados (DPO)">
        <p>
          O encarregado (art. 41) é o canal de comunicação entre você, a RR e a Autoridade Nacional de Proteção de Dados
          (ANPD):
        </p>
        <ul>
          <li><strong>Nome:</strong> <Fill>{C.dpoName}</Fill></li>
          <li><strong>E-mail:</strong> <Fill>{C.dpoEmail}</Fill></li>
          <li><strong>Endereço para correspondência:</strong> <Fill>{C.address}</Fill></li>
        </ul>
      </LegalSection>

      <LegalSection id="dados-coletados" n={4} title="Dados que tratamos">
        <p>Tratamos apenas os dados necessários para cada finalidade. Conforme o seu uso, podem ser:</p>
        <h3>4.1 Cadastro e conta</h3>
        <ul>
          <li>Nome, e-mail, senha (armazenada apenas como hash criptográfico), telefone/WhatsApp, foto, data de nascimento, fuso horário;</li>
          <li>Identificadores de login social (Google, Apple), quando você escolhe essa opção;</li>
          <li>Perfil (atleta, treinador, administrador), assessoria vinculada, código de indicação;</li>
          <li>Registros dos seus aceites dos Termos e da Política (data, versão, IP e navegador), para comprovar o consentimento (art. 8º, §2º).</li>
        </ul>
        <h3>4.2 Perfil esportivo e treinos</h3>
        <ul>
          <li>Nível, modalidade, metas, planilhas e treinos prescritos, comentários do treinador;</li>
          <li>Resultados de treinos: distância, duração, ritmo, parciais, altimetria, calorias, percepção de esforço e sensações;</li>
          <li>Atividades importadas do <strong>Strava</strong> e de outras integrações que você autorizar (Garmin, Coros, Polar, Apple Saúde, Google Fit), que podem incluir o trajeto GPS da atividade;</li>
          <li>Rankings, conquistas, participação em grupos e depoimentos que você publicar.</li>
        </ul>
        <h3>4.3 Dados de saúde (sensíveis)</h3>
        <p>Detalhados na seção 5: anamnese, frequência cardíaca, variabilidade da FC (HRV), sono, estresse, SpO₂, peso e composição corporal, lesões, informações médicas, avaliações físicas, exames e documentos enviados, diário alimentar, hidratação e suplementação.</p>
        <h3>4.4 Geolocalização em tempo real</h3>
        <p>
          Quando <strong>você inicia</strong> uma sessão de rastreamento ao vivo, o app coleta sua localização durante a
          corrida e a compartilha com o seu treinador/assessoria. A coleta termina quando você encerra a sessão. Você pode
          negar ou revogar a permissão de localização nas configurações do aparelho a qualquer momento.
        </p>
        <h3>4.5 Comunicações</h3>
        <ul>
          <li>Mensagens do chat entre atleta e treinador;</li>
          <li>Mensagens de WhatsApp enviadas pela assessoria por meio da integração, quando habilitada;</li>
          <li>E-mails transacionais e notificações push (token do dispositivo) que enviamos a você.</li>
        </ul>
        <h3>4.6 Compras, eventos e pagamentos</h3>
        <ul>
          <li>Pedidos da loja: produto, tamanho, quantidade, valores, nome, e-mail, telefone e <strong>endereço de entrega</strong>;</li>
          <li>Inscrições em eventos: percurso, tamanho de camiseta, kit, contato de emergência e informações médicas que você informar;</li>
          <li>
            Pagamentos: valor, forma, status e identificadores da transação. <strong>Dados de cartão e o CPF</strong> exigidos
            pelo meio de pagamento são enviados diretamente aos gateways (Asaas, Stripe ou outro indicado no checkout) e
            <strong> não são armazenados pela RR</strong>.
          </li>
        </ul>
        <h3>4.7 Dados técnicos e de navegação</h3>
        <ul>
          <li>Endereço IP, data e hora de acesso, navegador, sistema operacional, modelo do aparelho;</li>
          <li>Registros de erro (com dados mínimos) para corrigir falhas;</li>
          <li>Cookies e armazenamento local estritamente necessários (seção 15).</li>
        </ul>
        <h3>4.8 Dados de treinadores e assessorias</h3>
        <p>
          Além do cadastro: biografia, especializações, certificações (como registro no CREF, quando informado), marca e
          identidade visual, dados de cobrança da assinatura e configurações de IA (incluindo, se você optar, sua própria
          chave de API, que guardamos criptografada).
        </p>
      </LegalSection>

      <LegalSection id="dados-saude" n={5} title="Dados de saúde (dados pessoais sensíveis)">
        <p>
          Dados referentes à saúde são <strong>dados pessoais sensíveis</strong> (LGPD, art. 5º, II) e recebem proteção
          reforçada. Na RR, eles incluem:
        </p>
        <ul>
          <li><strong>Anamnese/questionário de saúde</strong> preenchido no pré-cadastro ou no app (histórico médico, doenças, medicamentos, cirurgias, dores);</li>
          <li><strong>Frequência cardíaca</strong> (repouso, máxima, média por treino, zonas), <strong>HRV</strong>, sono, estresse, saturação de oxigênio e passos sincronizados de relógios e apps;</li>
          <li><strong>Peso, altura, IMC, percentual de gordura e massa muscular</strong>;</li>
          <li><strong>Lesões</strong>, restrições e informações médicas informadas em treinos ou inscrições em provas;</li>
          <li><strong>Avaliações físicas</strong> (VO₂máx, testes de força e flexibilidade) e exames ou laudos enviados como documentos;</li>
          <li>Registros de <strong>alimentação, hidratação e suplementação</strong>.</li>
        </ul>
        <p>
          <strong>Base legal:</strong> tratamos esses dados com o seu <strong>consentimento específico e destacado</strong>{' '}
          (art. 11, I), coletado em um campo próprio no cadastro, separado do aceite dos Termos, para a finalidade de{' '}
          <strong>acompanhamento do seu treino pela sua assessoria</strong>. Em situações específicas, outras bases do
          art. 11, II podem se aplicar — por exemplo, cumprimento de obrigação legal, exercício regular de direitos ou
          proteção da vida e da incolumidade física (como o contato de emergência em uma prova).
        </p>
        <p>
          <strong>Revogação:</strong> você pode revogar o consentimento a qualquer momento em{' '}
          <Link href={LEGAL_ROUTES.myData}>Meus dados</Link>. A revogação não afeta o que foi feito antes dela (art. 8º,
          §5º), mas a assessoria deixará de poder usar esses dados para prescrever seus treinos, o que pode limitar o
          acompanhamento.
        </p>
        <p>
          <strong>O que não fazemos:</strong> não usamos dados de saúde para publicidade, não os vendemos e não os
          compartilhamos para obter vantagem econômica (art. 11, §4º). A RR não é serviço de saúde e não faz diagnóstico.
        </p>
      </LegalSection>

      <LegalSection id="finalidades" n={6} title="Finalidades e bases legais">
        <p>Cada tratamento tem uma finalidade definida e uma base legal da LGPD:</p>
        <Table>
          <thead>
            <tr><th>Finalidade</th><th>Dados</th><th>Base legal</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Criar e manter sua conta, autenticar o acesso, prestar o serviço contratado (planilhas, treinos, chat, loja, eventos)</td>
              <td>Cadastro, perfil esportivo, treinos, comunicações, pedidos</td>
              <td>Execução de contrato e procedimentos preliminares (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Acompanhamento do treino pela assessoria com base em dados de saúde</td>
              <td>Dados de saúde (seção 5)</td>
              <td>Consentimento específico e destacado (art. 11, I)</td>
            </tr>
            <tr>
              <td>Rastreamento ao vivo durante a corrida</td>
              <td>Geolocalização em tempo real</td>
              <td>Execução de contrato (art. 7º, V), iniciado por você; permissão do sistema operacional</td>
            </tr>
            <tr>
              <td>Sincronizar atividades de Strava e outros apps/relógios</td>
              <td>Atividades, GPS, FC e métricas importadas</td>
              <td>Execução de contrato (art. 7º, V) e, para métricas de saúde, consentimento (art. 11, I)</td>
            </tr>
            <tr>
              <td>Processar pagamentos de assinaturas, loja, encomendas e inscrições</td>
              <td>Dados do pedido e da transação</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Emitir documentos fiscais e manter registros contábeis</td>
              <td>Dados de transação e identificação</td>
              <td>Cumprimento de obrigação legal ou regulatória (art. 7º, II)</td>
            </tr>
            <tr>
              <td>Guardar registros de acesso à aplicação</td>
              <td>IP, data e hora</td>
              <td>Obrigação legal — Marco Civil, art. 15 (art. 7º, II)</td>
            </tr>
            <tr>
              <td>Segurança da conta, prevenção a fraudes e abusos, limitação de tentativas de login</td>
              <td>Dados técnicos, registros de acesso</td>
              <td>Legítimo interesse (art. 7º, IX) e prevenção à fraude e segurança do titular (art. 11, II, &quot;g&quot;)</td>
            </tr>
            <tr>
              <td>Monitorar erros e estabilidade, métricas agregadas de uso para melhorar o produto</td>
              <td>Dados técnicos mínimos, eventos de erro</td>
              <td>Legítimo interesse (art. 7º, IX)</td>
            </tr>
            <tr>
              <td>Avisos operacionais (lembrete de treino, pagamento, mudanças nos Termos)</td>
              <td>E-mail, token de push</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Novidades, conteúdos e ofertas</td>
              <td>Nome, e-mail</td>
              <td>Consentimento (art. 7º, I) — opcional, revogável em Meus dados ou no link do e-mail</td>
            </tr>
            <tr>
              <td>Defesa em processos judiciais, administrativos ou arbitrais</td>
              <td>Dados pertinentes ao caso</td>
              <td>Exercício regular de direitos (art. 7º, VI e art. 11, II, &quot;d&quot;)</td>
            </tr>
          </tbody>
        </Table>
        <h3>Sobre o legítimo interesse</h3>
        <p>
          Usamos o legítimo interesse apenas para segurança, prevenção a fraudes e melhoria do serviço. Fizemos a
          ponderação exigida pelo art. 10: (i) a finalidade é legítima e concreta; (ii) usamos o mínimo de dados,
          preferencialmente agregados ou pseudonimizados; (iii) esses usos são esperados por quem usa uma plataforma
          online e protegem o próprio usuário; e (iv) nunca usamos dados de saúde com base em legítimo interesse. Você
          pode se opor a esses tratamentos (seção 12).
        </p>
      </LegalSection>

      <LegalSection id="ia" n={7} title="Inteligência artificial">
        <p>
          A RR oferece ferramentas de IA para <strong>apoiar o treinador</strong>: análise de treinos e avaliações,
          resumo da anamnese, sugestão de planilhas, leitura de documentos enviados e um assistente de conversa.
        </p>
        <ul>
          <li>
            <strong>Quem aciona:</strong> as análises são disparadas pelo treinador/assessoria (ou por funcionalidades
            que ela habilita, como a análise automática do questionário de pré-cadastro).
          </li>
          <li>
            <strong>Quais dados:</strong> os dados de treino e, quando consentido, de saúde necessários para a análise
            solicitada. Procuramos limitar o envio ao mínimo necessário.
          </li>
          <li>
            <strong>Para onde vão:</strong> provedores de modelos de linguagem — Anthropic, OpenAI, Google e, se a
            assessoria escolher, xAI — localizados principalmente nos Estados Unidos (seção 9). Contratamos esses serviços
            via API comercial, configurada para que os dados não sejam usados para treinar os modelos, conforme os termos
            desses provedores. Se o treinador usar a própria chave de API, o envio ocorre sob o contrato dele com o provedor.
          </li>
          <li>
            <strong>Sem decisões automatizadas com efeito jurídico:</strong> a IA gera sugestões; o treinador revisa e
            decide. Nenhuma decisão que afete seus direitos é tomada exclusivamente por meios automatizados.
          </li>
          <li>
            <strong>Revisão (art. 20):</strong> se considerar que uma análise automatizada afetou seus interesses, você
            pode pedir revisão e explicações sobre os critérios utilizados, pelos canais da seção 13.
          </li>
          <li>
            Resultados de IA podem conter erros. Não substituem avaliação médica nem o julgamento profissional do treinador.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="compartilhamento" n={8} title="Compartilhamento e operadores">
        <p>
          <strong>Não vendemos dados pessoais.</strong> Compartilhamos dados apenas quando necessário, com:
        </p>
        <ul>
          <li><strong>Sua assessoria/treinador</strong> — os dados de atleta que você e as integrações geram, para o acompanhamento;</li>
          <li><strong>Outros atletas do grupo</strong> — apenas o que você escolhe tornar visível (ex.: nome e posição em rankings, depoimentos);</li>
          <li><strong>Autoridades</strong> — quando houver obrigação legal ou ordem judicial;</li>
          <li><strong>Prestadores de serviço (operadores)</strong>, contratados com cláusulas de confidencialidade e proteção de dados:</li>
        </ul>
        <Table>
          <thead>
            <tr><th>Fornecedor</th><th>Finalidade</th><th>Localização principal</th></tr>
          </thead>
          <tbody>
            <tr><td><Fill>{C.hostingProvider}</Fill></td><td>Hospedagem dos servidores e banco de dados (Postgres)</td><td><Fill>{C.hostingCountry}</Fill></td></tr>
            <tr><td>Supabase</td><td>Armazenamento de arquivos (fotos, documentos, imagens)</td><td>Conforme região contratada</td></tr>
            <tr><td>Strava (e Garmin, Coros, Polar, Apple, Google, quando conectados por você)</td><td>Importação de atividades e métricas</td><td>EUA e outros</td></tr>
            <tr><td>Asaas</td><td>Pagamentos (Pix, boleto, cartão) e dados de cobrança, incluindo CPF</td><td>Brasil</td></tr>
            <tr><td>Stripe</td><td>Pagamentos com cartão</td><td>EUA / Irlanda</td></tr>
            <tr><td>Mercado Pago / Pagar.me</td><td>Pagamentos, quando usados por determinada assessoria ou plano</td><td>Brasil</td></tr>
            <tr><td>Resend</td><td>Envio de e-mails transacionais</td><td>EUA</td></tr>
            <tr><td>Expo (com Apple Push e Firebase Cloud Messaging)</td><td>Notificações push no celular</td><td>EUA</td></tr>
            <tr><td>Sentry</td><td>Monitoramento de erros e estabilidade</td><td>EUA</td></tr>
            <tr><td>Anthropic, OpenAI, Google, xAI</td><td>Processamento de IA solicitado pelo treinador (seção 7)</td><td>EUA</td></tr>
            <tr><td>Z-API</td><td>Envio de mensagens de WhatsApp pela assessoria, quando habilitado</td><td>Brasil</td></tr>
            <tr><td>Google e Apple</td><td>Login social, quando você escolhe essa opção</td><td>EUA</td></tr>
          </tbody>
        </Table>
        <p>
          Em caso de reorganização societária (fusão, aquisição, venda de ativos), os dados poderão ser transferidos ao
          sucessor, que ficará obrigado a respeitar esta Política.
        </p>
      </LegalSection>

      <LegalSection id="transferencia" n={9} title="Transferência internacional de dados">
        <p>
          Alguns operadores ficam fora do Brasil, principalmente nos Estados Unidos. Essas transferências ocorrem nas
          hipóteses do art. 33 da LGPD, especialmente: (i) com garantias contratuais de proteção de dados, como cláusulas
          contratuais padrão (art. 33, II, conforme regulamentação da ANPD); (ii) quando necessárias para executar o
          contrato com você (art. 33, IX); e (iii) com o seu consentimento específico, quando for o caso (art. 33, VIII).
        </p>
        <p>
          Exigimos desses fornecedores medidas de segurança compatíveis com a LGPD. Você pode pedir informações
          adicionais sobre uma transferência específica ao encarregado.
        </p>
      </LegalSection>

      <LegalSection id="retencao" n={10} title="Por quanto tempo guardamos os dados">
        <Table>
          <thead>
            <tr><th>Dados</th><th>Prazo</th></tr>
          </thead>
          <tbody>
            <tr><td>Cadastro, perfil, treinos e comunicações</td><td>Enquanto a conta estiver ativa; após a exclusão, eliminados ou anonimizados, salvo as hipóteses abaixo</td></tr>
            <tr><td>Dados de saúde</td><td>Enquanto houver consentimento e conta ativa; eliminados ou anonimizados em até <strong>30 dias</strong> após a exclusão da conta ou a revogação, salvo obrigação legal de guarda</td></tr>
            <tr><td>Registros fiscais, de pagamento e de pedidos</td><td>Enquanto a conta estiver ativa + <strong>5 anos</strong> (prazos fiscais e do CDC)</td></tr>
            <tr><td>Registros de acesso (IP, data e hora)</td><td><strong>6 meses</strong> (Marco Civil da Internet, art. 15)</td></tr>
            <tr><td>Registros de consentimento</td><td>Enquanto a conta existir + 5 anos, para comprovação (art. 8º, §2º)</td></tr>
            <tr><td>Marketing</td><td>Até a revogação do consentimento</td></tr>
            <tr><td>Dados necessários para defesa em processos</td><td>Até o fim do prazo prescricional aplicável</td></tr>
          </tbody>
        </Table>
        <p>
          Ao fim do tratamento, os dados são eliminados ou anonimizados, conservados apenas nas hipóteses do art. 16 da
          LGPD. Cópias de segurança (backups) são sobrescritas em ciclos regulares.
        </p>
      </LegalSection>

      <LegalSection id="seguranca" n={11} title="Segurança">
        <p>Adotamos medidas técnicas e administrativas para proteger os dados (art. 46), entre elas:</p>
        <ul>
          <li>Conexões criptografadas (HTTPS/TLS) entre seu dispositivo e nossos servidores;</li>
          <li>Senhas armazenadas com hash forte (bcrypt); segredos de 2FA e chaves de API criptografados;</li>
          <li>Autenticação em dois fatores disponível para treinadores; revogação de sessões ao trocar a senha;</li>
          <li>Controle de acesso por perfil: cada assessoria vê apenas os próprios atletas;</li>
          <li>Limitação de tentativas de login e de requisições para dificultar ataques;</li>
          <li>Registros de auditoria de ações sensíveis e monitoramento de erros;</li>
          <li>Acesso interno restrito a quem precisa, com dever de confidencialidade.</li>
        </ul>
        <p>
          Nenhum sistema é 100% seguro. Proteja sua senha, não a compartilhe e avise-nos se suspeitar de uso indevido.
        </p>
      </LegalSection>

      <LegalSection id="direitos" n={12} title="Seus direitos (LGPD, art. 18)">
        <p>Você pode, a qualquer momento e gratuitamente:</p>
        <ul>
          <li><strong>Confirmar</strong> se tratamos seus dados;</li>
          <li><strong>Acessar</strong> seus dados;</li>
          <li><strong>Corrigir</strong> dados incompletos, inexatos ou desatualizados;</li>
          <li>Pedir <strong>anonimização, bloqueio ou eliminação</strong> de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;</li>
          <li>Pedir a <strong>portabilidade</strong> dos dados a outro fornecedor;</li>
          <li>Pedir a <strong>eliminação</strong> dos dados tratados com base no consentimento (ressalvado o art. 16);</li>
          <li>Obter <strong>informação sobre com quem compartilhamos</strong> seus dados;</li>
          <li>Ser informado sobre a possibilidade de <strong>não consentir</strong> e as consequências da negativa;</li>
          <li><strong>Revogar o consentimento</strong> (marketing, dados de saúde);</li>
          <li><strong>Opor-se</strong> a tratamento feito com base em outra hipótese legal, em caso de descumprimento da LGPD;</li>
          <li>Pedir <strong>revisão de decisões automatizadas</strong> (art. 20);</li>
          <li><strong>Peticionar à ANPD</strong> (seção 18).</li>
        </ul>
      </LegalSection>

      <LegalSection id="como-exercer" n={13} title="Como exercer seus direitos">
        <ul>
          <li>
            <strong>Pela plataforma:</strong> em <Link href={LEGAL_ROUTES.myData}>Meus dados</Link> você vê o histórico de
            consentimentos, ativa ou desativa comunicações de marketing, gerencia o consentimento de dados de saúde,
            baixa uma cópia dos seus dados (JSON) e solicita a exclusão da conta. Correções de cadastro podem ser feitas
            no seu perfil.
          </li>
          <li>
            <strong>Por e-mail:</strong> escreva para o encarregado em <Fill>{C.dpoEmail}</Fill>, a partir do e-mail
            cadastrado.
          </li>
        </ul>
        <p>
          Respondemos em até <strong>{DATA_REQUEST_RESPONSE_DAYS} dias</strong> (art. 19, II). Para sua segurança, podemos
          pedir confirmação de identidade. Se o pedido envolver dados controlados pela sua assessoria, nós o
          encaminharemos a ela e acompanharemos a resposta. Se não pudermos atender (por exemplo, por obrigação legal de
          guarda), explicaremos o motivo.
        </p>
      </LegalSection>

      <LegalSection id="menores" n={14} title="Crianças e adolescentes">
        <p>
          A RR é destinada a maiores de 18 anos. Atletas <strong>menores de 18 anos</strong> só podem usar a plataforma
          com <strong>autorização e consentimento específico de pelo menos um dos pais ou responsável legal</strong>{' '}
          (art. 14). Por isso, no cadastro pedimos a confirmação de que a pessoa tem 18 anos ou mais, ou tem autorização do
          responsável.
        </p>
        <ul>
          <li>A assessoria que treina menores deve obter e guardar a autorização do responsável;</li>
          <li>Tratamos dados de menores sempre no seu melhor interesse, sem perfis para publicidade;</li>
          <li>
            Se soubermos que um menor se cadastrou sem autorização, poderemos suspender a conta e eliminar os dados.
            Responsáveis podem nos contatar pelo e-mail do encarregado.
          </li>
          <li>Não é permitido o cadastro de crianças (menores de 12 anos) diretamente pela plataforma.</li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" n={15} title="Cookies e armazenamento local">
        <p>
          Usamos <strong>apenas cookies e armazenamento local essenciais</strong> para o funcionamento do serviço:
        </p>
        <ul>
          <li><strong>Sessão e login</strong> — mantêm você conectado com segurança (ex.: cookie <code>rr_auth</code> e tokens no armazenamento do navegador);</li>
          <li><strong>Preferências</strong> — como modo escuro e o aviso de cookies já visto;</li>
          <li><strong>Funcionamento offline (PWA)</strong> — cache de páginas e recursos no seu aparelho para o app abrir sem internet.</li>
        </ul>
        <p>
          <strong>Não usamos</strong> cookies de publicidade, pixels de rastreamento de anúncios nem vendemos dados de
          navegação. Como esses itens são estritamente necessários, não dependem de consentimento; você pode apagá-los nas
          configurações do navegador, mas o login e o modo offline deixarão de funcionar. Se no futuro passarmos a usar
          cookies não essenciais, pediremos seu consentimento antes.
        </p>
      </LegalSection>

      <LegalSection id="incidentes" n={16} title="Incidentes de segurança">
        <p>
          Se ocorrer um incidente de segurança que possa gerar risco ou dano relevante aos titulares, comunicaremos a{' '}
          <strong>ANPD</strong> e os <strong>titulares afetados</strong> no prazo e na forma da regulamentação vigente
          (art. 48 e Resolução CD/ANPD nº 15/2024), informando a natureza dos dados, os riscos, as medidas adotadas e as
          recomendações para você se proteger. Quando o incidente envolver dados controlados por uma assessoria,
          avisaremos também a assessoria.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" n={17} title="Alterações desta Política">
        <p>
          Podemos atualizar esta Política para refletir mudanças no serviço ou na lei. Cada versão é identificada pela
          data no topo da página. Em mudanças relevantes, avisaremos por e-mail e/ou no app e{' '}
          <strong>pediremos um novo aceite</strong> antes de você continuar usando a plataforma. Quando a mudança envolver
          finalidade de tratamento baseada em consentimento, pediremos novo consentimento específico. O histórico dos seus
          aceites fica disponível em <Link href={LEGAL_ROUTES.myData}>Meus dados</Link>.
        </p>
      </LegalSection>

      <LegalSection id="contato" n={18} title="Contato e direito de reclamar à ANPD">
        <ul>
          <li><strong>Encarregado (DPO):</strong> <Fill>{C.dpoEmail}</Fill></li>
          <li><strong>Suporte:</strong> <Fill>{C.supportEmail}</Fill></li>
          <li><strong>Controladora:</strong> <Fill>{C.legalName}</Fill> — CNPJ <Fill>{C.cnpj}</Fill> — <Fill>{C.address}</Fill></li>
        </ul>
        <p>
          Se não ficar satisfeito com a nossa resposta, você tem o direito de apresentar reclamação à{' '}
          <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> pelo site{' '}
          <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">gov.br/anpd</a>, e também aos órgãos
          de defesa do consumidor.
        </p>
      </LegalSection>
    </LegalDocLayout>
  );
}
