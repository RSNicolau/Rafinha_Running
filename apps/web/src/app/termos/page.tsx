import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocLayout, LegalSection, Fill, type TocItem } from '@/components/legal/LegalDocLayout';
import { LEGAL_COMPANY as C, LEGAL_ROUTES, TERMS_VERSION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description:
    'Regras de uso da plataforma RR — Rafinha Running para atletas, treinadores e assessorias de corrida.',
  alternates: { canonical: '/termos' },
};

const TOC: TocItem[] = [
  { id: 'aceite', title: 'Aceite e quem somos' },
  { id: 'servico', title: 'O que é a RR' },
  { id: 'contas', title: 'Contas e perfis' },
  { id: 'elegibilidade', title: 'Quem pode usar' },
  { id: 'obrigacoes', title: 'Suas obrigações' },
  { id: 'treinadores', title: 'Responsabilidades de treinadores e assessorias' },
  { id: 'saude', title: 'Aviso de saúde' },
  { id: 'integracoes-ia', title: 'Integrações e inteligência artificial' },
  { id: 'pagamentos', title: 'Planos e pagamentos' },
  { id: 'loja', title: 'Loja, encomendas e eventos' },
  { id: 'arrependimento', title: 'Arrependimento, cancelamento e reembolso' },
  { id: 'propriedade', title: 'Propriedade intelectual e conteúdo' },
  { id: 'usos-proibidos', title: 'Usos proibidos' },
  { id: 'disponibilidade', title: 'Disponibilidade do serviço' },
  { id: 'responsabilidade', title: 'Limitação de responsabilidade' },
  { id: 'suspensao', title: 'Suspensão e encerramento' },
  { id: 'alteracoes', title: 'Alterações dos Termos' },
  { id: 'lei-foro', title: 'Lei aplicável e foro' },
  { id: 'contato', title: 'Contato' },
];

export default function TermsPage() {
  return (
    <LegalDocLayout
      title="Termos de Uso"
      version={TERMS_VERSION}
      toc={TOC}
      sibling={{ href: LEGAL_ROUTES.privacy, label: 'Política de Privacidade' }}
      summary={
        <ul>
          <li>A RR é uma <strong>ferramenta</strong> para treinadores e assessorias acompanharem seus atletas. Não é serviço médico.</li>
          <li>
            Quem prescreve os treinos é o <strong>seu treinador</strong>, que é o responsável técnico por eles. Antes de
            treinar, procure liberação médica; se sentir algo estranho, <strong>pare</strong>.
          </li>
          <li>Você é responsável pela sua conta e pelas informações que coloca na plataforma.</li>
          <li>
            Compras online podem ser canceladas em até <strong>7 dias</strong> (CDC, art. 49). Eventos e encomendas têm
            regras próprias, sempre mostradas antes do pagamento.
          </li>
          <li>Não garantimos que a plataforma nunca fique fora do ar, mas trabalhamos para isso.</li>
          <li>Se mudarmos estes Termos de forma relevante, vamos avisar e pedir um novo aceite.</li>
        </ul>
      }
    >
      <LegalSection id="aceite" n={1} title="Aceite e quem somos">
        <p>
          Estes Termos de Uso regulam o acesso e o uso do site, do aplicativo web (PWA) e do aplicativo móvel{' '}
          <strong>{C.tradeName}</strong> (&quot;RR&quot; ou &quot;Plataforma&quot;), operados por <Fill>{C.legalName}</Fill>,
          CNPJ <Fill>{C.cnpj}</Fill>, com sede em <Fill>{C.address}</Fill>.
        </p>
        <p>
          Ao criar uma conta ou usar a Plataforma, você declara que leu, entendeu e aceita estes Termos e a{' '}
          <Link href={LEGAL_ROUTES.privacy}>Política de Privacidade</Link>. Se não concordar, não use a Plataforma.
          Quando você usa a RR em nome de uma empresa (por exemplo, uma assessoria), declara ter poderes para aceitar estes
          Termos em nome dela.
        </p>
      </LegalSection>

      <LegalSection id="servico" n={2} title="O que é a RR">
        <p>A RR é uma plataforma de software (SaaS) para assessorias esportivas e seus atletas, que oferece, entre outros recursos:</p>
        <ul>
          <li>Criação e envio de planilhas e treinos;</li>
          <li>Sincronização de atividades via Strava e outras integrações (Garmin, Coros, Polar, Apple Saúde, Google Fit);</li>
          <li>Questionários de anamnese, avaliações físicas, diário alimentar e acompanhamento de indicadores;</li>
          <li>Rastreamento ao vivo durante corridas;</li>
          <li>Chat entre atleta e treinador e notificações;</li>
          <li>Ferramentas de inteligência artificial de apoio ao treinador;</li>
          <li>Eventos e inscrições em provas, loja virtual (produtos a pronta entrega e encomendas) e cobranças;</li>
          <li>Personalização de marca (white-label) para assessorias.</li>
        </ul>
        <p>
          As funcionalidades disponíveis dependem do plano contratado pela assessoria e podem evoluir com o tempo.
        </p>
      </LegalSection>

      <LegalSection id="contas" n={3} title="Contas e perfis">
        <ul>
          <li>
            <strong>Atleta</strong> — usa a Plataforma para receber treinos e ser acompanhado por uma assessoria. A conta
            pode ser criada pelo próprio atleta, por convite ou pela assessoria.
          </li>
          <li>
            <strong>Treinador / Assessoria</strong> — profissional ou empresa que contrata a RR para gerir atletas,
            planilhas, eventos, loja e comunicação.
          </li>
          <li>
            <strong>Administrador</strong> — usuários da RR ou de contas white-label com permissões de gestão.
          </li>
        </ul>
        <p>
          Você deve fornecer informações verdadeiras e mantê-las atualizadas, guardar sua senha em sigilo e nos avisar
          imediatamente sobre qualquer uso não autorizado. Você é responsável pelas atividades realizadas na sua conta. A
          conta é pessoal e intransferível; treinadores com equipe devem usar acessos individuais.
        </p>
        <p>
          Contas criadas por convite, pela assessoria ou por login social (Google/Apple) precisarão aceitar estes Termos e
          a Política de Privacidade no primeiro acesso.
        </p>
      </LegalSection>

      <LegalSection id="elegibilidade" n={4} title="Quem pode usar">
        <ul>
          <li>Pessoas com <strong>18 anos ou mais</strong> e plena capacidade civil;</li>
          <li>
            Atletas <strong>menores de 18 anos</strong>, somente com autorização e consentimento específico de pelo menos um
            dos pais ou responsável legal, que responde pelo uso. A assessoria que treina menores deve obter e guardar essa
            autorização;
          </li>
          <li>Não é permitido o cadastro direto de crianças (menores de 12 anos).</li>
        </ul>
        <p>Podemos solicitar confirmação de idade ou da autorização e suspender contas em desacordo.</p>
      </LegalSection>

      <LegalSection id="obrigacoes" n={5} title="Suas obrigações">
        <p>Ao usar a RR, você se compromete a:</p>
        <ul>
          <li>Cumprir a lei, estes Termos e a Política de Privacidade;</li>
          <li>Inserir apenas dados que você tem o direito de compartilhar — inclusive dados de terceiros, como contato de emergência;</li>
          <li>Informar ao seu treinador, com sinceridade, condições de saúde, lesões e sintomas relevantes;</li>
          <li>Respeitar os demais usuários no chat, grupos, rankings e depoimentos;</li>
          <li>Manter seus aplicativos e integrações atualizados e protegidos.</li>
        </ul>
      </LegalSection>

      <LegalSection id="treinadores" n={6} title="Responsabilidades de treinadores e assessorias">
        <p>Treinadores e assessorias que usam a RR declaram e se comprometem a:</p>
        <ul>
          <li>
            Ser os <strong>responsáveis técnicos e profissionais</strong> pelas prescrições de treino, avaliações e
            orientações dadas aos atletas, inclusive as elaboradas com apoio das ferramentas de IA, que são apenas sugestões;
          </li>
          <li>
            Possuir a habilitação exigida para a atividade — incluindo registro no <strong>CREF</strong> quando a lei o
            exigir — e respeitar os limites da profissão, encaminhando o atleta a médicos, nutricionistas ou
            fisioterapeutas quando necessário;
          </li>
          <li>
            Atuar como <strong>controladores</strong> dos dados de treino e saúde dos seus atletas (ver{' '}
            <Link href={`${LEGAL_ROUTES.privacy}#papeis`}>Política de Privacidade, seção 2</Link>), tratando-os conforme a
            LGPD, com sigilo, apenas para o acompanhamento esportivo, e atendendo pedidos dos titulares;
          </li>
          <li>
            Obter as autorizações necessárias (como a do responsável por atleta menor) e não inserir dados de pessoas sem
            base legal;
          </li>
          <li>
            Ser os responsáveis, perante os consumidores, pelos <strong>produtos que vendem</strong> na loja e pelos{' '}
            <strong>eventos que organizam</strong> (entrega, qualidade, trocas, segurança e regras da prova), sem prejuízo
            dos direitos do consumidor previstos em lei;
          </li>
          <li>Cumprir obrigações fiscais próprias das vendas e serviços que realizarem;</li>
          <li>Não usar a Plataforma para enviar mensagens não solicitadas (spam) a atletas ou terceiros.</li>
        </ul>
        <p>
          A RR é uma <strong>ferramenta</strong>: não presta serviços de treinamento, não supervisiona as prescrições e não
          responde pelo conteúdo técnico definido por treinadores e assessorias.
        </p>
      </LegalSection>

      <LegalSection id="saude" n={7} title="Aviso de saúde">
        <p>
          <strong>A RR não oferece aconselhamento médico, diagnóstico ou tratamento.</strong> Informações, métricas,
          zonas de treino e análises (inclusive por IA) têm caráter informativo e de apoio ao treinador, e podem conter
          imprecisões — por exemplo, dados de frequência cardíaca de relógios e sensores.
        </p>
        <ul>
          <li>Antes de iniciar ou intensificar um programa de treinos, <strong>procure avaliação e liberação médica</strong>;</li>
          <li>
            <strong>Interrompa a atividade imediatamente</strong> e procure atendimento se sentir dor no peito, falta de ar
            incomum, tontura, desmaio, palpitações ou qualquer sintoma anormal. Em emergência, ligue <strong>192 (SAMU)</strong>;
          </li>
          <li>Respeite seus limites, condições climáticas e regras de segurança no trânsito, especialmente ao correr na rua com o app aberto;</li>
          <li>O rastreamento ao vivo não é um serviço de emergência nem garante socorro.</li>
        </ul>
      </LegalSection>

      <LegalSection id="integracoes-ia" n={8} title="Integrações e inteligência artificial">
        <p>
          Integrações com Strava e outros serviços dependem de você autorizar a conexão e estão sujeitas aos termos desses
          terceiros. Não controlamos a disponibilidade, a precisão ou mudanças das APIs de terceiros; você pode desconectar
          uma integração a qualquer momento.
        </p>
        <p>
          As ferramentas de IA geram sugestões automatizadas que <strong>devem ser revisadas pelo treinador</strong> antes
          de qualquer uso. Não use resultados de IA como única base para decisões sobre saúde.
        </p>
      </LegalSection>

      <LegalSection id="pagamentos" n={9} title="Planos e pagamentos">
        <ul>
          <li>
            <strong>Assinatura da Plataforma (treinadores/assessorias):</strong> planos, preços, periodicidade e eventual
            período de teste são informados na página de planos e no checkout. A renovação é automática, salvo cancelamento
            antes do fim do período vigente. Reajustes serão comunicados com antecedência mínima de 30 dias.
          </li>
          <li>
            <strong>Mensalidades de assessoria (atletas):</strong> valores e condições são definidos pela assessoria, que é
            a fornecedora do serviço de treinamento; a RR apenas processa a cobrança em nome dela.
          </li>
          <li>
            Pagamentos são processados por gateways parceiros (como Asaas e Stripe). Dados de cartão e o CPF exigido pelo
            meio de pagamento são enviados diretamente ao gateway e não ficam armazenados na RR.
          </li>
          <li>
            Em caso de inadimplência, o acesso a funcionalidades pagas pode ser suspenso após aviso, e restabelecido com a
            regularização.
          </li>
          <li>Preços incluem os tributos aplicáveis, salvo indicação em contrário.</li>
        </ul>
      </LegalSection>

      <LegalSection id="loja" n={10} title="Loja, encomendas e eventos">
        <h3>10.1 Loja</h3>
        <p>
          Os produtos (acessórios, vestuário etc.) são vendidos pela assessoria indicada na página do produto. Fotos são
          ilustrativas; preço, estoque, frete e prazo são mostrados antes da confirmação. O pedido pode ter reserva de
          estoque por tempo limitado até a confirmação do pagamento.
        </p>
        <h3>10.2 Encomendas (pré-venda)</h3>
        <p>
          Itens sob encomenda são produzidos ou adquiridos após o pedido. O <strong>prazo estimado de entrega</strong> é
          informado antes do pagamento e pode variar por fatores do fornecedor; atrasos relevantes serão comunicados. Se
          o prazo informado não for cumprido, você poderá optar por aguardar ou cancelar com reembolso integral.
        </p>
        <h3>10.3 Eventos e provas</h3>
        <p>
          Cada evento tem <strong>regulamento próprio</strong>, definido pelo organizador (a assessoria), com regras de
          inscrição, kit, retirada, transferência, cancelamento e reembolso — exibido antes da inscrição. Ao se
          inscrever, você declara estar apto(a) fisicamente para a distância escolhida e concorda com o regulamento.
          Se o organizador cancelar o evento, você terá direito ao reembolso conforme o regulamento e a lei.
        </p>
      </LegalSection>

      <LegalSection id="arrependimento" n={11} title="Arrependimento, cancelamento e reembolso">
        <ul>
          <li>
            <strong>Direito de arrependimento (CDC, art. 49):</strong> compras feitas pela internet — assinaturas, produtos
            da loja e encomendas — podem ser canceladas em até <strong>7 dias</strong> a partir da contratação ou do
            recebimento do produto, com devolução integral dos valores pagos, inclusive frete. Para produtos, o item deve ser
            devolvido conforme as instruções do vendedor.
          </li>
          <li>
            <strong>Inscrições em eventos:</strong> também podem ser canceladas em até 7 dias da compra, desde que antes da
            realização do evento; após esse prazo, valem as regras de cancelamento do regulamento do evento (que podem
            prever, por exemplo, transferência de inscrição ou reembolso parcial).
          </li>
          <li>
            <strong>Assinatura da Plataforma:</strong> passado o prazo de arrependimento, o cancelamento pode ser feito a
            qualquer momento e produz efeito ao final do período já pago, sem multa, salvo condição diferente informada no
            plano contratado.
          </li>
          <li>
            Reembolsos são feitos pelo mesmo meio de pagamento, nos prazos do gateway e da operadora do cartão.
          </li>
          <li>Produtos com defeito seguem as regras de garantia do CDC (arts. 18 e 26).</li>
        </ul>
        <p>Para cancelar ou pedir reembolso, fale com a assessoria vendedora ou com o suporte da RR (seção 19).</p>
      </LegalSection>

      <LegalSection id="propriedade" n={12} title="Propriedade intelectual e conteúdo">
        <p>
          O software, a marca RR — Rafinha Running, o design, os textos e demais elementos da Plataforma pertencem à RR ou
          a seus licenciantes. Concedemos a você uma licença pessoal, limitada, não exclusiva, intransferível e revogável
          para usar a Plataforma conforme estes Termos.
        </p>
        <p>
          Você continua dono do conteúdo que envia (fotos, comentários, documentos, depoimentos). Ao publicar, você nos
          concede licença gratuita, não exclusiva e limitada para hospedar, processar e exibir esse conteúdo{' '}
          <strong>apenas para operar a Plataforma</strong> e na forma que você escolheu (por exemplo, depoimento visível
          na página da assessoria). Planilhas e materiais criados por treinadores pertencem aos treinadores.
        </p>
        <p>
          Marcas e logotipos de assessorias (white-label) pertencem às respectivas assessorias, que garantem ter direito
          de usá-los.
        </p>
      </LegalSection>

      <LegalSection id="usos-proibidos" n={13} title="Usos proibidos">
        <p>É proibido:</p>
        <ul>
          <li>Acessar contas, dados ou áreas sem autorização, ou tentar burlar mecanismos de segurança;</li>
          <li>Fazer engenharia reversa, copiar, revender ou sublicenciar a Plataforma sem autorização;</li>
          <li>Usar robôs, scraping ou sobrecarregar os sistemas (ataques de negação de serviço);</li>
          <li>Inserir vírus, código malicioso ou conteúdo ilegal, ofensivo, discriminatório, difamatório ou que viole direitos de terceiros;</li>
          <li>Inserir dados pessoais de terceiros sem base legal, ou usar dados obtidos na Plataforma para outras finalidades;</li>
          <li>Falsificar identidade, idade ou autorização de responsável;</li>
          <li>Enviar spam ou usar a Plataforma para fraudes, inclusive em pagamentos, cupons e programas de indicação;</li>
          <li>Usar a Plataforma para oferecer serviços de saúde que exijam habilitação que você não possui.</li>
        </ul>
      </LegalSection>

      <LegalSection id="disponibilidade" n={14} title="Disponibilidade do serviço">
        <p>
          Trabalhamos para manter a Plataforma disponível e segura, mas <strong>não garantimos funcionamento
          ininterrupto ou livre de erros</strong>. Podem ocorrer interrupções para manutenção (preferencialmente
          programadas e avisadas), falhas de terceiros (hospedagem, internet, Strava, gateways, lojas de aplicativos) ou
          eventos de força maior. Não há acordo de nível de serviço (SLA) com garantia de disponibilidade, salvo contrato
          específico com a assessoria.
        </p>
        <p>
          Recomendamos que treinadores mantenham cópias de materiais importantes. Você pode exportar seus dados pessoais
          em <Link href={LEGAL_ROUTES.myData}>Meus dados</Link>.
        </p>
      </LegalSection>

      <LegalSection id="responsabilidade" n={15} title="Limitação de responsabilidade">
        <p>Na máxima extensão permitida pela lei — e sem afastar direitos irrenunciáveis do consumidor previstos no CDC —, a RR não responde por:</p>
        <ul>
          <li>Prescrições, orientações e condutas de treinadores e assessorias, nem por lesões ou danos decorrentes da prática esportiva;</li>
          <li>Decisões tomadas exclusivamente com base em métricas, análises automatizadas ou dados de dispositivos de terceiros;</li>
          <li>Produtos vendidos e eventos organizados por assessorias, ressalvada a responsabilidade solidária prevista no CDC quando aplicável;</li>
          <li>Indisponibilidades ou falhas causadas por terceiros ou por força maior;</li>
          <li>Danos causados por uso indevido da conta, inclusive por compartilhamento de senha.</li>
        </ul>
        <p>
          Nas relações <strong>entre a RR e treinadores/assessorias</strong> (relação empresarial), a responsabilidade
          total da RR fica limitada ao valor pago pela assessoria à RR nos 12 meses anteriores ao fato, exceto em caso de
          dolo ou culpa grave. Nas relações de consumo, valem as regras do CDC.
        </p>
      </LegalSection>

      <LegalSection id="suspensao" n={16} title="Suspensão e encerramento">
        <ul>
          <li>Você pode encerrar sua conta a qualquer momento, solicitando a exclusão em <Link href={LEGAL_ROUTES.myData}>Meus dados</Link>.</li>
          <li>
            Podemos suspender ou encerrar contas que violem estes Termos, a lei ou que coloquem em risco outros usuários ou
            a Plataforma. Sempre que possível e proporcional, avisaremos antes e daremos oportunidade de regularização.
          </li>
          <li>
            Se a assessoria encerrar a assinatura, o acesso dos seus atletas às funcionalidades da assessoria pode ser
            interrompido; o atleta mantém seus direitos sobre os próprios dados pessoais.
          </li>
          <li>Após o encerramento, os dados seguem os prazos de retenção da Política de Privacidade.</li>
        </ul>
      </LegalSection>

      <LegalSection id="alteracoes" n={17} title="Alterações dos Termos">
        <p>
          Podemos alterar estes Termos para refletir mudanças no serviço ou na lei. A versão vigente fica sempre nesta
          página, identificada pela data. Mudanças relevantes serão comunicadas por e-mail e/ou no app e exigirão{' '}
          <strong>novo aceite</strong> para continuar usando a Plataforma. Se não concordar, você pode encerrar a conta.
        </p>
      </LegalSection>

      <LegalSection id="lei-foro" n={18} title="Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de{' '}
          <Fill>{C.forumCity}</Fill> para resolver controvérsias, <strong>exceto</strong> quando você for consumidor, caso
          em que poderá propor a ação no foro do seu domicílio (CDC, art. 101, I). Antes de recorrer ao Judiciário,
          incentivamos o contato com o nosso suporte e o uso da plataforma consumidor.gov.br.
        </p>
      </LegalSection>

      <LegalSection id="contato" n={19} title="Contato">
        <ul>
          <li><strong>Suporte:</strong> <Fill>{C.supportEmail}</Fill></li>
          <li><strong>Privacidade e dados pessoais (encarregado/DPO):</strong> <Fill>{C.dpoEmail}</Fill></li>
          <li><strong>Empresa:</strong> <Fill>{C.legalName}</Fill> — CNPJ <Fill>{C.cnpj}</Fill> — <Fill>{C.address}</Fill></li>
        </ul>
      </LegalSection>
    </LegalDocLayout>
  );
}
