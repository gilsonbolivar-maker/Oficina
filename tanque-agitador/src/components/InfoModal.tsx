/**
 * InfoModal: Comprehensive Technical Documentation and Chemical/Mechanical
 * Engineering fundamentals of the 5x5x4m tank, central agitator, and solid-liquid suspension.
 */

import React from 'react';
import {
  BookOpen,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  Waves,
  X,
  Zap,
  Download,
} from 'lucide-react';
import { CODIGO_URL } from '../versao';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto text-slate-200">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Princípios de Agitação e Prevenção de Decantação
              </h2>
              <p className="text-xs text-slate-400">
                Engenharia de Processos • Tanque Industrial 5m × 5m × 4m (100 m³) • Desenvolvedor: <span className="text-sky-400 font-semibold">Gilson Bolivar</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 text-sm">
          {/* Section 1: Especificações Geométricas */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              1. Geometria e Dimensões do Tanque
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 font-mono text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Comprimento (X)</span>
                <span className="text-slate-100 font-bold">5,00 m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Largura (Z)</span>
                <span className="text-slate-100 font-bold">5,00 m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Altura (Y)</span>
                <span className="text-slate-100 font-bold">4,00 m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Volume Total</span>
                <span className="text-sky-300 font-bold">100 m³ (100.000 L)</span>
              </div>
            </div>
          </div>

          {/* Section 2: Por que o líquido decanta se ficar parado? */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              2. Por que o líquido decanta se ficar parado?
            </h3>
            <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
              Em misturas heterogêneas (líquido com sólidos em suspensão como efluentes, cal, polpa
              ou lama), as partículas possuem densidade maior que a água (
              <span className="font-mono text-amber-300">ρ_p &gt; ρ_f</span>). Pela{' '}
              <strong>Lei de Stokes</strong>, na ausência de forças mecânicas hidrodinâmicas, a
              gravidade puxa continuamente cada partícula para o fundo:
            </p>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-center text-xs text-amber-300">
              v_s = [ g · (ρ_partícula - ρ_fluido) · d_p² ] / ( 18 · μ )
            </div>

            <p className="text-slate-400 text-xs">
              Quando o motor do agitador é desligado, a velocidade de circulação interna cessa. Em
              poucos minutos, toda a massa de sólidos atinge o fundo do tanque, formando uma camada
              compactada de lodo (leito decantado) e deixando o líquido superior límpido.
            </p>
          </div>

          {/* Section 3: Como o agitador central evita a decantação? */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              3. Como o Agitador Central impede a Decantação?
            </h3>
            <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
              O agitador central utiliza um sistema mecânico de duplo estágio com acionamento por
              motorredutor:
            </p>

            <ul className="space-y-2 text-xs sm:text-sm text-slate-300 list-disc list-inside bg-slate-800/40 p-3 rounded-xl border border-slate-700/40">
              <li>
                <strong>Turbina Axial Inferior (Pás a 45°):</strong> Instalada a apenas 55 cm do
                fundo do tanque, com 1,65 m de diâmetro. Ela gera um potente jato hidrodinâmico
                descendente que colide com o piso, varre o fundo radialmente e arranca qualquer
                partícula em sedimentação.
              </li>
              <li>
                <strong>Turbina Rushton Intermediária:</strong> Promove dispersão radial e quebra
                grumos e aglomerados a meia altura (2,1 m).
              </li>
              <li>
                <strong>Velocidade Crítica de Zwietering (N_js):</strong> É a rotação mínima
                calculada para que nenhuma partícula permaneça parada no fundo por mais de 1 a 2
                segundos, garantindo 100% de suspensão ativa.
              </li>
            </ul>
          </div>

          {/* Section 4: Função das 4 Chicanas Defletoras */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              4. O Papel das 4 Chicanas (Baffles) nas Paredes
            </h3>
            <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
              Sem as 4 placas defletoras verticais de 45 cm nas paredes internas, o líquido apenas
              giraria em rotação de corpo rígido com um redemoinho central profundo e pouca mistura
              vertical. As chicanas quebram o vórtice rotacional e forçam o fluxo para cima ao longo
              das 4 paredes, criando um circuito fechado de recirculação toroidal que mantém os
              sólidos homogeneizados por todo o tanque de 100 mil litros.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-4 flex flex-wrap items-center justify-between gap-2">
          <a
            href={CODIGO_URL}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Ver código-fonte no GitHub</span>
          </a>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs sm:text-sm transition-colors shadow-lg"
          >
            Entendido / Fechar Guia
          </button>
        </div>
      </div>
    </div>
  );
};
