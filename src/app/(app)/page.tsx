import { es } from "@/messages/es";
import { getHomeKpis, type HomeKpis } from "@/lib/home/queries";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KpiCardData {
  label: string;
  value: number | null;
  /** Destructive accent — the "Tareas vencidas" card, mirroring tarea-card.tsx's Badge variant="destructive". */
  accent: boolean;
}

function buildKpiCards(kpis: HomeKpis): KpiCardData[] {
  return [
    {
      label: es.home.kpis.clientesActivos,
      value: kpis.clientesActivos,
      accent: false,
    },
    {
      label: es.home.kpis.oportunidadesAbiertas,
      value: kpis.oportunidadesAbiertas,
      accent: false,
    },
    {
      label: es.home.kpis.tareasPendientes,
      value: kpis.tareasPendientes,
      accent: false,
    },
    {
      label: es.home.kpis.tareasVencidas,
      value: kpis.tareasVencidas,
      accent: true,
    },
    { label: es.home.kpis.documentos, value: kpis.documentos, accent: false },
  ];
}

export default async function HomePage() {
  const kpis = await getHomeKpis();
  const cards = buildKpiCards(kpis);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{es.common.appName}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">{es.home.welcome}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  card.value === null && "text-muted-foreground",
                  card.value !== null && card.accent && "text-destructive",
                )}
              >
                {card.value ?? es.home.kpis.unavailable}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
