# Navegação no celular

Causa reproduzida no servidor 3000: Next.js 16.4.6 bloqueava /_next/hmr quando Origin era 192.168.0.132 ou 127.0.0.1. Os chunks retornavam sem 404, mas os componentes React não hidratavam; o problema afetava também ações e formulários. A mesma página em localhost hidratou e o menu abriu.

Evidência: .next/dev/logs/next-development.log registrou "Blocked cross-origin request to Next.js dev resource /_next/hmr" para ambos os hosts. A documentação instalada de allowedDevOrigins confirma o bloqueio por hostname no modo dev.

Correção: allowedDevOrigins explícito apenas para esses dois hosts. Sem wildcard, mudança no menu, alteração no banco real ou reinício de 3000/3001.

Outros problemas reproduzidos em 320px: cartões do Gerador/Ideias ampliavam a página para 327px; bloco de diagnóstico de Meus vídeos mantinha largura mínima maior que seu espaço. Ajustados min-width e quebra do nome do formato.

Validação: scripts/mobile-ui.mjs usa Chrome touch, porta 3037, cópia do banco e automações desabilitadas. Confere hidratação e navegação nas três origens, 8 rotas em 320/390/768/1280px e uma gravação sem mudança na cópia. Typecheck e lint. Sem IA e sem teste pago.

Após merge: no terminal do Radar, Ctrl+C e npm run dev. Recarregar a página do celular. O IP permitido é o IP atual; se mudar, a lista deve ser atualizada.
