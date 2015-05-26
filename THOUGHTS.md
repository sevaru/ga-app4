Выделить единую систему управления нотами.. чтобы поверх нее можно было (де)сериализовывать все.

Запрашивать интервалы строить их и этот объект должен иметь удобное DTO

ScoresDTO = {
    key:  (Cmaj)
    grid: 8
}


//API
Scores[1].createInterval("tercium")
Scores[1].tercium();


class Scores {

    intervals
    

}