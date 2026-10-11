import { ImageResponse } from "next/og";

// Master Brand Favicon for Aibotflow CRM (matches user-provided brand mark)
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const LOGO_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAI/klEQVR42rVXe3BU1R3+zuPe3b2bF9kkSHgk0XQzkOiAFpHQYEVmHEusWDMVtRJoqAoKiEICGjujoCUQpR1Ga1tXiNoCrdVWqGK1LRLJoKPUB0gTEpBXEshzs7t39z7OOf1jE8Qiiml7Zs6cuXNnzvfd73fud34fKV+4DMMdO6pyCQCoK5YDAG5YdL/6pnvw4QLPwCUUaJPloXZ1Q+h+AEDNuhpmWpra+PAa+X8j0FJZSAFTGaFGUQ6gur7WnxDC6yOyv666TgDA4tW19EJJkG9SgpbKQhpsaJXV9bX+bUcOzHGkO2eE5h8/QjeMizMyT4/ypuzO8Xk3PHDPyoMXSoJeKPji1bU02NAq8xfNLq7/eM/b3bb1bEKRmQ5Vo12GEZLSIg/3/cSW5P0Hn3j0lo0Pr5GLV9d+7f4sOHnqBX1524Y/yfxFs4ubY71vxDVa5FgJqStAk1AG18AIASXK9Wlez+lEZHakOPut19f++vji1bX0vX/sVsMmUJK+gYh3i1TNuhq242TLH3q4KqGW5WiEUU5AOeOEcEZ8YEQqxSSky7nOP+5pz887tPDFHa876r8qwXsVL1MAqD+4d0kXtcscYUpJoNkQNCFcmI6tbOEi6trKhlSc6zzbY0Dn+symiq23AIBZVcaGRaClspAaoUahzysrOEbNmih1AACOrmBDwAGko1xiWgkwTSM6KPnnR03kpd2void8Cq6UNSnzSw0j1CiGPGNYv2EnsddHYI+kEgqEUCVdaFxTtitoQgAjNI6jLZ/imV3bcTKTQhWMJLpIl6MzRk1UFHMDwDNJ32gXF6yAWVXGgg2t0plfeutpmrjZdi3pQBCbKjiQcKgiNgSIztB5uA0vvLUNJ4oD0KZfjkBeIUZnjqF+6gMX2n3V9bX+86lAz+d0RqhRzHrorouOILa2DxYEI9QmAkIKuFDKli4cXaHfijvvfrwHiSmXwCgKIg0GAvAhW3qRa3tlgTer6PeH9y8AgKQKF6YABYDn2t//aQ+1xik4sEnSU4R0pQNB4hCKSILeY21uV0EqjLx8GFJDJvXCrzQYLkMq4zTb58fY1MCSJXWrAkaoUWx/+knylQTMqjJWHmoXsmrajGOI3JVwzCQwXNhEQjBChXQlKCWU4sO0dN8d/oI81weODKpDB4fPIfCDIeBPQxrhKi89cHHEde8EgHeip+h5CQxJX11f6z8ge38WpQ6FUq4rxTkkACBdsnVZ24//cbQe2JwOAzoYDEmhg8HLOHTKkcJ1AgABj//uJXWrAnXVdaJmXQ07nwIUAO7a/8rd3TRxpRC2JIxwqSRs4ZwhAUKRLshWbVPTFgCYRNNWpijS5FEcugNHB5M61aXOOAyPR6VpXjXWlzYuoPkeGAIaKsUZJ2ypLKRTNx2V0bmTi1tp+EWL2LqihBACRRQhACCUBKMMfklPFSHjtuW33RrpGp9z1UDCydOA/bAScUtTzcq1PhpwY5/0d5w8+NnRtg8T4b6TuVkXZWT50q6bNnNargX87d6lD9nbn36SnLkNS9I3kGuW95B5h7ft6KHx64Ghi4yAK6oAgEpCfMyHgOS3/mrCDzs2H9r77BGnv/A0tRCGhZg0o45IyHh/xCs7ex109IC090IdO+3k8gztsdrHjOkTS0lLpPttP6ez1i1fE6ODtWf7w8vUfW2vLOuj1vWAI5MEJAAFl0gCAJLpYFL97rmSW9SfT36662zwOBKQUCmC0hQAgM79RNf9lOl+mpGR0d5x3P/Affdi7/FDNmW+qw/29j4KACS49ykabGiV0bmTi/exrl0JamadeyyS0yt594LUSd/PNjJ/u6erreCEGJDtrc002nYUMhqDY9kAANUXhYrHocUEnJgJmBY0B7B7enDTPYvVjQsWkc5wd1+6R5vAgw2tEgCaWf/6BLWzzrUECUBJCk4dIZZU5E0at/nwBwW9Mq66Dx2ip3ftAQmbUGYcJOoCpgXlDt4ZlgASSVK24wCWgw9e+yuZePNNakC5I8Kx+GQKAAfmjZ+blN49C9TFWeeApkr6xrXPH9/yVmdrYZ8VAwBYn50ACZuY+O0peHzNExhTFISWPQI19U+om+b/GABw7Y/mYM0Lm5FTMgFIuIh19eBUNKwsqRCx4xdTAIgRt0pCABi0uzPAyXOgOWRgXIKtAIBTZqQzrlzooEQLW1BmHBXfuQ6rJs7EpPElGDlmDNbOqCArb18AZKfj9tlz1IOl38Nlk68ABiz4swNIQNABy4QiJMpT5pcaturMAwgAQoGz+wflApTnEP3hUVvaPgGAkoycv/R0Dpz0Mf/otnAMaO/HMw2/wf5/HcDON3fC6erDDzY+gqMtLVCH2/HYk2uxc+oU7H71NQDAqKuvUjGliDnQ72ZlBT4l5QuX4b3533q7H/Z0qlwpmQtAUEC4AOMpgr9x5ys116+tWI8ZuIQaoUaRv2j2UjD2852P16m2ffuS2SAS+5x3OJ5cvRwYsIBEsrT5s65Rl65cIqRHY0zIfStKrpzCASAT+i+jVE2XUEMKSIByryQdeY5v6f7wMhV0DfpIcSnq0IhU3XfYGiyTisRANA2ZBQWK5WSe23bH4kT5fSrnsktV9sxpNKIzrtu29HNtVV11neA7qnJJeejAVmveeL0P8tEExFhCmOVTcneB5V8xaktb81A7jnU44+GEULh9UXiMNFG08HZGp05QJlPUGSTGAFBQcBB4FCec6CQGwGOZjo9qleamv7/ZUllIeXmoXbVUFtLizQefT5lf+lKz3THW028PfPedms61FesRHAL/j9EXG8DIyy/DmKV3MCvTiA6IWMyRnzc8YnASxRAjwvIIq88j+a4cbvzC3tx4xKwqY8FQo+AAEGxolS2VhTS4qckcDTQDwMuVT9Ggm3z3ZQ1DTCmk3zgjbMF6hHUe2zYpJy/85dEnudxTXGbVVdcJeyjghBrFF3rCYEOr3FGVS4KuQYaez+kVLE0BgCUT3VE70uha8RWpW99/t6OykGZtavrKFFSHJphVZawm/+ovZEcy3HQ8FL3MqjJ2wu1QLdz82mRcHmpX/5N0DADXffacCg5KGQQQHOZG/wYlK251Uy/f8wAAAABJRU5ErkJggg==";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <img
          src={LOGO_BASE64}
          alt="Aibotflow"
          width="32"
          height="32"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
