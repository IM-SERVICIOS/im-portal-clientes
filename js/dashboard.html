async function cargarUsuario() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    document.getElementById("usuario").innerHTML = `
        <h2>${user.email}</h2>
    `;

    const { data, error } = await supabaseClient
        .from("usuarios")
        .select("*");

    console.log("USUARIOS:", data);
    console.log("ERROR:", error);
}

cargarUsuario();
