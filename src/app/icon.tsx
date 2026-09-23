import { ImageResponse } from "next/og";

// Master Brand Favicon for Aibotflow CRM (matches user-provided brand mark)
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const LOGO_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAC4lBMVEVMaXG1V/h4eABNB/+obPf1v/WtUv9UAP90MPrgx/n///9/Kfzqx/s8GmnHhfrTi/qpS/bXkviWPPuhSP1VAP/su/zpwfvipftcCvuzZvqpWfzcpfjNfvv0yvvKf/mZS/RKLXOFM/tzPfWgUPlyH/1UF/s/CP9sFPt+KftzG/3Kf/nHevvBbPe1Xvr6z/+LMP1+Jfp4QPN3RuFkDviMMPxmEv2DMv1cDP5qFPy+YfncmPfLffNZDvmnhNGXQvuHMft1Q5m8avnBpdVLAuUrF01PEv1WC/1+J/2gSP2qXP+aPf+XQv11Hfy2Y/y2VvrTifiqTPuaR//ptfzxyPtaCOny2f6eSfz41P2fTv/cmftoKfrpt/zyxv2mU/Hvz/mdQffEbflmGv2xW/l3NdGXYNOyh9eQOPruyfmZWeK1WP/w0PgUAGEkAYegRv83IGd6RuNhC/mjT/8vAKiNL//Xk/x1Hv0+AMeWOv5xNqO8YPTdru7sv/uua/+fQv/2xvrcmP3Cdfl+W5kYCTG6bPvipvfZmPfFa/vuvf1JB/9sFv9BB/9jD/t8Iv5TB/8EACRLCP9XB/9fCv9QB/9ZB/+KLf+vUPeSNf+OL/+FKf15GP+9Z/miQ/1tDf91Gv/Shf3OgP3GdvmJKf/Vhv8AAABEB/8NATW3XvhFJH+mSfecQv/ttP/zv//Ncv+qQv/Ka/9BAM6ePf7/3f+3X/+xkNYJASqnUP0vBIsUAUIYAU8cAWojCFwAABH///8LAD1mDv+QNf1jB/3clf7iqvmVO/1FANh+GfyaN//cnPe3UP+RKv82Aa9mEfzJev01CpRLGqWAIv9CJ1wnA3UZCDw1G1toT5K9af83JErBXvwAABsSAF58XallDvn/zv+sddfLeP9KI5mubPOjXtsNAEecS+n+wf/yrf9oI81iHM5BDKMiAH13OrQAAApNIJLYgP8jFzJ/Y6llPau1k+N3Wqbaye1WPIKFZrSsdzC+AAAA2HRSTlMA/QH9CgIDAQIDAegL/jlN+v79/gP6E/79IVkYY1dvo/5zJyu2uPvgXsEru/7C/v79LRn74etY/vPM7v3x/qfo/kX++f7m9smsQuiW/XHk5Nho2Jr9Kc/1WN1ueeE3hpD9uFn2o7XQ6qjvme/0z/RTWXD0m3ul9MX9+/nAE/M/3tv+/OSN9/7+///////////////////////////////////////////////+/////////////////////////////////////////////////v////////6vft05AAAACXBIWXMAAAsSAAALEgHS3X78AAAC30lEQVQ4y2NgQAXs7FxcDLgBOxs7kORkxSXPAZTmEeNkYMChgoOBR0bb3yooOBS7ClYGLct1a+YdXHUnXBabCg4GLb8TjDrWguKieqJ8mCqYGDh11wowzlow7/gh0dXaTBgGsDH4zhZaMXWZznxB8dV68yOAAmgWSHpNE1q5AmjEwUObbR+EsTCwoynwmKK//7Dw1GX37t4/dSRkRiCqEWwMUlMMZkzZv3LFpodn1x+YufBYAA+yEewM0iYze3pm6B9eKXDuyJyj02czrpFDNkKEwXtm59wegxn6s5PXA+U3TJ21KFKMgQthgafP7U6Qium5+cYzpxxbseyM4KpoBk64BTzu+4xPg1RMl2IoPjlt9tRZ84+vihGDqRBhUNwn0d3d3dl53o6BoaZ8gwBjwjzx1RvjGDi5ID5Utpgw2RykgluSk89RSt5OXj4jJTV9YxYP2BlMrCqTe3snmJt3zzWra9g67byFjXNZUU52ntPGah6IBROZJ00CqphTKjsPKN95WsJ5/altFx+5VD1pAVtg2g8Ek3onm/LVbxJ6/uLstm0Xd+7asf1SX+NTK2mgESq9Hf0dHf3MEwtkzwg/e7nz5o7te/cu3bKl78Y1wUX8DAwaE/v7l3Qt6ZiUyFByVfjczg8fl++yvbX0yubLu99Zv5VjYNCcwNzR1dW1xMaQQWbT1jc3N+/5tHzP5x1Oe64svrZgjQwDi/rkSUAFav1RDAzSzVeX713+ddf2W1/6FN5fWuywrpIPaMIBCeYlaktUmdjZGOTmKyxd2tfXt3v3jdeLF1+ovG4JDEuzORN7mTtclRg4OBn45yn0bXHhBYHLvBVTTzA6giJCQ13CTdUQ6F+ggkUXml4JTV+4cMr0aRvWrhVIAooCEYuSERM7kAVUsMDhca09NwjYm6TFS0KSBAcIgwiggnWZhUYsUMAJkQJFNwcHNOfw6cbCBEHJhBVb7mLjYIcBrNmbA10EAEyKAg4nEwvnAAAAAElFTkSuQmCC";

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
