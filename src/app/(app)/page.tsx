import { es } from "@/messages/es";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">{es.common.appName}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-base text-muted-foreground">{es.home.welcome}</p>
      </CardContent>
    </Card>
  );
}
